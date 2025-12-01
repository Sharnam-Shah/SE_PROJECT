from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from google.oauth2 import id_token
from google.auth.transport import requests
from django.conf import settings
from mongoengine import DoesNotExist
from .models import User, LawyerProfile, LawyerConnectionRequest
import random
import cloudinary
import cloudinary.uploader
import requests as http_requests
import traceback

from .serializers import (
    RegisterSerializer,
    LoginSerializer,
    UserSerializer,
    GoogleAuthSerializer,
    VerifyOTPSerializer,
    ResendOTPSerializer,
    UserProfileSerializer,
    LawyerProfileSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
    LawyerConnectionRequestSerializer,
    ChangePasswordSerializer,
    AddPasswordSerializer,
    LawyerConnectionStatusSerializer,
    AdminLawyerVerificationSerializer,
    AdminPromoteUserSerializer,
    AdminCreateAdminSerializer,
)
from datetime import datetime
from uuid import uuid4

from .otp_utils import create_and_send_otp, is_otp_valid, clear_otp
from utils.mongo_utils import ensure_mongo_connection


def get_tokens_for_user(user):
    """Generate JWT tokens for a MongoEngine user"""
    refresh = RefreshToken()
    refresh["user_id"] = str(user.id)
    refresh["email"] = user.email

    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


@api_view(["POST"])
@permission_classes([AllowAny])
def signup_view(request):
    """Register new user and send OTP for verification"""
    try:
        # Validate request data
        if not request.data:
            return Response(
                {"error": "No data provided. Please fill in all required fields."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            # Format validation errors for better readability
            errors = {}
            for field, messages in serializer.errors.items():
                if isinstance(messages, list):
                    errors[field] = messages[0] if messages else "Invalid value"
                else:
                    errors[field] = str(messages)
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        # Create user
        try:
            user = serializer.save()
        except Exception as e:
            return Response(
                {
                    "error": "Failed to create user account. Please try again.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # User is not verified yet, send OTP
        user.is_verified = False
        user.save()

        # Generate and send OTP
        try:
            otp_sent = create_and_send_otp(user)

            if not otp_sent:
                # Rollback user creation if OTP fails
                user.delete()
                return Response(
                    {
                        "error": "Failed to send verification email. Please check your email address and try again."
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        except Exception as e:
            # Rollback user creation if OTP fails
            user.delete()
            return Response(
                {
                    "error": "Email service temporarily unavailable. Please try again later.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response_payload = {
            "message": "Registration successful. OTP sent to your email. Please verify to continue.",
            "email": user.email,
            "requires_verification": True,
            "redirect": "verify-otp",
            "role": user.role,
            "lawyer_verification_status": user.lawyer_verification_status,
        }
        if user.role == "lawyer":
            response_payload["lawyer_message"] = (
                "Your lawyer profile is pending verification. Our team will review your credentials shortly."
            )
        return Response(response_payload, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response(
            {
                "error": "An unexpected error occurred during registration. Please try again.",
                "details": str(e) if settings.DEBUG else None,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """Login user with email and password"""
    try:
        # Validate request data
        if not request.data:
            return Response(
                {"error": "Please provide email and password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            # Format validation errors
            errors = {}
            for field, messages in serializer.errors.items():
                if isinstance(messages, list):
                    errors[field] = messages[0] if messages else "Invalid value"
                else:
                    errors[field] = str(messages)
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        # Check if user exists
        try:
            user = User.objects(email=email).first()
            if not user:
                return Response(
                    {
                        "error": "Invalid email or password. Please check your credentials and try again."
                    },
                    status=status.HTTP_401_UNAUTHORIZED,
                )
        except DoesNotExist:
            return Response(
                {
                    "error": "Invalid email or password. Please check your credentials and try again."
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except Exception as e:
            return Response(
                {
                    "error": "Database error. Please try again later.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Check if user registered with Google and has no usable password
        if user.auth_provider == "google" and not user.has_usable_password():
            return Response(
                {
                    "error": "This account is registered with Google. Please use Google Sign In."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Authenticate user
        try:
            authenticated_user = authenticate(email=email, password=password)
            if authenticated_user is None:
                return Response(
                    {
                        "error": "Invalid email or password. Please check your credentials and try again."
                    },
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            user = authenticated_user
        except Exception as e:
            return Response(
                {
                    "error": "Authentication failed. Please try again.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Check if user is verified
        if not user.is_verified:
            # Send OTP for verification
            try:
                otp_sent = create_and_send_otp(user)

                if not otp_sent:
                    return Response(
                        {
                            "error": "Failed to send verification email. Please try again."
                        },
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
            except Exception as e:
                return Response(
                    {
                        "error": "Email service temporarily unavailable. Please try again later.",
                        "details": str(e) if settings.DEBUG else None,
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            return Response(
                {
                    "message": "Your account is not verified. OTP sent to your email.",
                    "email": user.email,
                    "requires_verification": True,
                    "redirect": "verify-otp",
                },
                status=status.HTTP_200_OK,
            )

        # User is verified, generate tokens
        try:
            tokens = get_tokens_for_user(user)
            user_data = UserSerializer(user).data
        except Exception as e:
            return Response(
                {
                    "error": "Failed to generate authentication tokens. Please try again.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "message": "Login successful",
                "user": user_data,
                "tokens": tokens,
                "redirect": "home",
            },
            status=status.HTTP_200_OK,
        )

    except Exception as e:
        return Response(
            {
                "error": "An unexpected error occurred during login. Please try again.",
                "details": str(e) if settings.DEBUG else None,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def google_auth_view(request):
    """Authenticate user with Google OAuth"""
    print("Google auth view started...")
    ensure_mongo_connection()
    try:
        # Validate request data
        if not request.data or not request.data.get("token"):
            print("Error: Google authentication token is required.")
            return Response(
                {"error": "Google authentication token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = GoogleAuthSerializer(data=request.data)
        if not serializer.is_valid():
            print(f"Error: Invalid Google authentication data. Details: {serializer.errors}")
            return Response(
                {
                    "error": "Invalid Google authentication data.",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data["token"]
        role = serializer.validated_data.get("role", "client")
        print(f"Received token: {token[:30]}...") # Log first 30 chars for brevity
        print(f"DEBUG: Received role from frontend: {role}")

        # The token from the frontend is an Access Token.
        # We use it to get the user's info from Google's userinfo endpoint.
        print("Verifying token with Google's userinfo endpoint...")
        headers = {"Authorization": f"Bearer {token}"}
        response = http_requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo", headers=headers, timeout=10
        )
        
        if response.status_code != 200:
            print(f"Error: Google userinfo endpoint failed. Status: {response.status_code}, Body: {response.text}")
            return Response(
                {
                    "error": "Failed to retrieve user information from Google.",
                    "details": response.text,
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user_info = response.json()
        print("Userinfo endpoint successful.")

        # Get user info from Google response
        email = user_info.get("email")
        google_id = user_info.get("sub")
        name = user_info.get("name", "")
        print(f"User info retrieved: email={email}, name={name}, google_id={google_id}")

        if not email:
            print("Error: Email not provided by Google.")
            return Response(
                {"error": "Email not provided by Google"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user exists, or create a new one
        try:
            user = User.objects(email=email).first()
            if user:
                print(f"User found with email {email}. Current role: {user.role}")
                # Update user details if they've changed
                if not user.google_id:
                    user.google_id = google_id
                if user.auth_provider != "google":
                    user.auth_provider = "google"
                user.is_verified = True  # Google users are always considered verified
                
                # Update role if provided (Aggressive update for onboarding fix)
                if role == 'lawyer' and user.role != 'admin':
                    print(f"DEBUG: Enforcing lawyer role for user {email}")
                    user.role = 'lawyer'
                    # Only reset verification if they weren't already verified
                    if not user.is_lawyer_verified:
                         user.lawyer_verification_status = 'pending'
                
                user.save()
            else:
                print(f"No user found with email {email}. Creating a new user with role: {role}")
                username = email.split("@")[0]
                # Ensure username is unique
                base_username = username
                counter = 1
                while User.objects(username=username).first():
                    username = f"{base_username}{counter}"
                    counter += 1
                
                user = User.create_user(
                    email=email,
                    username=username,
                    name=name,
                    google_id=google_id,
                    auth_provider="google",
                    password="!",  # Set an unusable password for OAuth users
                    role=role,
                )
                user.is_verified = True
                user.save()
                print("New user created successfully.")

        except Exception as e:
             print(f"Database error during user lookup/creation: {str(e)}")
             return Response(
                {"error": "An error occurred while processing your account.", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Generate JWT tokens for the user
        # Check if user is a lawyer and needs to complete their profile
        if user.role == 'lawyer' and not user.is_lawyer_verified: # Assuming is_lawyer_verified means profile complete
            # Check if a profile exists and is pending
            lawyer_profile = LawyerProfile.objects(user=user).first()
            if not lawyer_profile or lawyer_profile.verification_status == 'not_submitted':
                # Return a special response to signal frontend to show onboarding modal
                print(f"Lawyer {user.email} needs to complete profile.")
                tokens = get_tokens_for_user(user) # Generate tokens here
                return Response(
                    {
                        "message": "Lawyer profile incomplete. Please provide more details.",
                        "requires_lawyer_onboarding": True,
                        "user": UserSerializer(user).data, # Send basic user data
                        "tokens": tokens, # Send tokens so frontend can authenticate for profile completion
                    },
                    status=status.HTTP_202_ACCEPTED, # 202 Accepted, indicates processing is ongoing
                )

        # If not a lawyer, or a lawyer with a complete profile, proceed with normal login
        print("Generating tokens for the user.")
        tokens = get_tokens_for_user(user)
        user_data = UserSerializer(user).data
        print("Google authentication successful. Returning response.")

        return Response(
            {
                "message": "Google authentication successful",
                "user": user_data,
                "tokens": tokens,
                "redirect": "home",
            },
            status=status.HTTP_200_OK,
        )

    except http_requests.exceptions.Timeout:
        print("Error: Google authentication timed out.")
        return Response(
            {"error": "Google authentication timed out. Please try again."},
            status=status.HTTP_504_GATEWAY_TIMEOUT,
        )
    except http_requests.exceptions.ConnectionError:
        print("Error: Unable to connect to Google services.")
        return Response(
            {
                "error": "Unable to connect to Google services. Please check your internet connection."
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except http_requests.exceptions.RequestException as e:
        print(f"Error: Failed to communicate with Google services. Details: {str(e)}")
        return Response(
            {
                "error": "Failed to communicate with Google services. Please try again.",
                "details": str(e) if settings.DEBUG else None,
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception as e:
        print(f"An unexpected error occurred in google_auth_view: {str(e)}")
        traceback.print_exc()
        return Response(
            {
                "error": "Google authentication failed. Please try again.",
                "details": str(e) if settings.DEBUG else None,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile_detail_update_view(request):
    """Get or update authenticated user profile"""
    user = request.user

    if request.method == "GET":
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == "PATCH":
        data = request.data.copy()  # Make a mutable copy of request.data

        # Handle profile picture upload
        profile_picture_file = request.FILES.get("profile_picture")
        if profile_picture_file:
            try:
                # Upload to Cloudinary
                upload_result = cloudinary.uploader.upload(profile_picture_file)
                data["profile_picture"] = upload_result[
                    "secure_url"
                ]  # Add the URL to the data for the serializer
            except Exception as e:
                return Response(
                    {"error": f"Failed to upload profile picture: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # Handle cover photo upload
        cover_photo_file = request.FILES.get("cover_photo")
        if cover_photo_file:
            try:
                # Upload to Cloudinary
                upload_result = cloudinary.uploader.upload(cover_photo_file)
                data["cover_photo"] = upload_result[
                    "secure_url"
                ]  # Add the URL to the data for the serializer
            except Exception as e:
                return Response(
                    {"error": f"Failed to upload cover photo: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # Handle other profile data (e.g., name)
        serializer = UserProfileSerializer(
            user, data=data, partial=True
        )  # Pass the modified data
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(user).data, status=status.HTTP_200_OK)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp_view(request):
    """Verify OTP and activate user account"""
    try:
        # Validate request data
        if not request.data:
            return Response(
                {"error": "Please provide email and OTP code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = VerifyOTPSerializer(data=request.data)
        if not serializer.is_valid():
            # Format validation errors
            errors = {}
            for field, messages in serializer.errors.items():
                if isinstance(messages, list):
                    errors[field] = messages[0] if messages else "Invalid value"
                else:
                    errors[field] = str(messages)
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        otp = serializer.validated_data["otp_code"]

        # Find user
        try:
            user = User.objects(email=email).first()
            if not user:
                return Response(
                    {"error": "No account found with this email address."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        except DoesNotExist:
            return Response(
                {"error": "No account found with this email address."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response(
                {
                    "error": "Database error. Please try again later.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Verify OTP
        try:
            if is_otp_valid(user, otp):
                user.is_verified = True
                user.save()
                clear_otp(user)

                tokens = get_tokens_for_user(user)
                user_data = UserSerializer(user).data

                return Response(
                    {
                        "message": "Account verified successfully. You can now login.",
                        "user": user_data,
                        "tokens": tokens,
                        "redirect": "home",
                    },
                    status=status.HTTP_200_OK,
                )
            else:
                return Response(
                    {"error": "Invalid or expired OTP. Please request a new one."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Exception as e:
            return Response(
                {
                    "error": "OTP verification failed. Please try again.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    except Exception as e:
        return Response(
            {
                "error": "An unexpected error occurred. Please try again.",
                "details": str(e) if settings.DEBUG else None,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def resend_otp_view(request):
    """Resend OTP to user's email"""
    try:
        # Validate request data
        if not request.data or not request.data.get("email"):
            return Response(
                {"error": "Email address is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ResendOTPSerializer(data=request.data)
        if not serializer.is_valid():
            # Format validation errors
            errors = {}
            for field, messages in serializer.errors.items():
                if isinstance(messages, list):
                    errors[field] = messages[0] if messages else "Invalid value"
                else:
                    errors[field] = str(messages)
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]

        # Find user
        try:
            user = User.objects(email=email).first()
            if not user:
                return Response(
                    {"error": "No account found with this email address."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        except DoesNotExist:
            return Response(
                {"error": "No account found with this email address."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response(
                {
                    "error": "Database error. Please try again later.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Check if already verified
        if user.is_verified:
            return Response(
                {"error": "Your account is already verified. Please login."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Send OTP
        try:
            otp_sent = create_and_send_otp(user)

            if otp_sent:
                return Response(
                    {"message": "New OTP sent to your email. Please check your inbox."},
                    status=status.HTTP_200_OK,
                )
            else:
                return Response(
                    {"error": "Failed to send OTP. Please try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        except Exception as e:
            return Response(
                {
                    "error": "Email service temporarily unavailable. Please try again later.",
                    "details": str(e) if settings.DEBUG else None,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    except Exception as e:
        return Response(
            {
                "error": "An unexpected error occurred. Please try again.",
                "details": str(e) if settings.DEBUG else None,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """Logout user by blacklisting the refresh token"""
    try:
        refresh_token = request.data["refresh"]
        token = RefreshToken(refresh_token)
        token.blacklist()
        return Response(status=status.HTTP_205_RESET_CONTENT)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password_view(request):
    """Send OTP for password reset"""
    serializer = ForgotPasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data["email"]

    try:
        user = User.objects(email=email).first()
        if not user:
            return Response(
                {"error": "User with this email does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )
    except DoesNotExist:
        return Response(
            {"error": "User with this email does not exist."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Check if user registered with Google
    if user.auth_provider == "google":
        return Response(
            {
                "error": "This account is registered with Google. Please use Google Sign In. Password reset is not available for Google accounts."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Generate and send OTP for password reset
    otp_sent = create_and_send_otp(user)

    if not otp_sent:
        return Response(
            {"error": "Failed to send OTP. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {"message": "OTP sent to your email for password reset.", "email": user.email},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password_view(request):
    """Reset user password with OTP verification"""
    print("Reset password request data:", request.data)  # Debugging line
    serializer = ResetPasswordSerializer(data=request.data)
    if not serializer.is_valid():
        print("ResetPasswordSerializer errors:", serializer.errors) # Debugging line
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data["email"]
    otp = serializer.validated_data["otp_code"]
    new_password = serializer.validated_data["new_password"]

    try:
        user = User.objects(email=email).first()
        if not user:
            return Response(
                {"error": "User not found."}, status=status.HTTP_404_NOT_FOUND
            )
    except DoesNotExist:
        return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    # Check if user registered with Google
    if user.auth_provider == "google":
        return Response(
            {
                "error": "This account is registered with Google. Password reset is not available."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify OTP
    if not is_otp_valid(user, otp):
        return Response(
            {"error": "Invalid or expired OTP."}, status=status.HTTP_400_BAD_REQUEST
        )

    # Reset password
    user.set_password(new_password)
    user.save()
    clear_otp(user)  # Clear OTP after successful reset

    return Response(
        {
            "message": "Password reset successfully. Please login with your new password."
        },
        status=status.HTTP_200_OK,
    )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """Change user password"""
    user = request.user
    serializer = ChangePasswordSerializer(data=request.data)
    if serializer.is_valid():
        if not user.check_password(serializer.data.get("current_password")):
            return Response({"error": "Incorrect current password."}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.data.get("new_password"))
        user.save()
        return Response({"message": "Password changed successfully."}, status=status.HTTP_200_OK)
    print("ChangePasswordSerializer errors:", serializer.errors) # Debugging line
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_password_view(request):
    """Add a password to a Google-authenticated user"""
    user = request.user
    if user.auth_provider != 'google':
        return Response({"error": "This feature is only for users who signed up with Google."}, status=status.HTTP_400_BAD_REQUEST)
    if user.password and user.password != '!':
        return Response({"error": "You already have a password."}, status=status.HTTP_400_BAD_REQUEST)
    
    serializer = AddPasswordSerializer(data=request.data)
    if serializer.is_valid():
        user.set_password(serializer.data.get("new_password"))
        user.save()
        return Response({"message": "Password added successfully."}, status=status.HTTP_200_OK)
    print("AddPasswordSerializer errors:", serializer.errors) # Debugging line
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated]) # Requires temporary authentication (from initial Google login)
def lawyer_profile_completion_view(request):
    """
    Endpoint for lawyers to complete their profile after initial Google login.
    Creates or updates the LawyerProfile and then issues JWT tokens for full login.
    """
    user = request.user
    if not user.is_authenticated:
        return Response({"error": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

    if user.role != 'lawyer':
        return Response({"error": "Only lawyers can complete this profile."}, status=status.HTTP_403_FORBIDDEN)

    try:
        # Check if profile already exists
        lawyer_profile = LawyerProfile.objects(user=user).first()
        serializer = LawyerProfileSerializer(instance=lawyer_profile, data=request.data, partial=True)
        
        if serializer.is_valid():
            # Set default verification status if creating new profile
            if not lawyer_profile:
                serializer.validated_data['verification_status'] = 'pending'
            
            # Use the user as the reference
            serializer.validated_data['user'] = user

            serializer.save()

            # Update user's lawyer status
            user.is_lawyer_verified = True # Profile is now submitted for verification
            user.lawyer_verification_status = 'pending'
            user.save()

            # OTP for email users, skip for Google users as email is already verified
            if user.auth_provider != 'google':
                try:
                    otp_sent = create_and_send_otp(user)
                    if not otp_sent:
                        raise Exception("Failed to send OTP for email verification.")
                except Exception as otp_e:
                    print(f"Error sending OTP after lawyer profile completion: {otp_e}")
                    return Response(
                        {"error": "Failed to send verification email. Please try again."},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

                # Response for email users who need OTP verification
                return Response(
                    {
                        "message": "Lawyer profile submitted successfully for verification. OTP sent to your email.",
                        "email": user.email, # Provide email for OTP verification page
                        "requires_verification": True,
                        "redirect": "verify-otp",
                    },
                    status=status.HTTP_200_OK,
                )
            else:
                # For Google users, no OTP needed. Directly log them in.
                tokens = get_tokens_for_user(user)
                user_data = UserSerializer(user).data
                return Response(
                    {
                        "message": "Lawyer profile submitted successfully for verification (Google user).",
                        "user": user_data,
                        "tokens": tokens,
                        "redirect": "home",
                    },
                    status=status.HTTP_200_OK,
                )
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {"error": f"An unexpected error occurred: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def search_users_view(request):
    """Search for users by username or name"""
    query = request.query_params.get("q", "").strip()

    if len(query) < 2:
        return Response({"users": []}, status=status.HTTP_200_OK)

    try:
        users = User.objects(
            __raw__={
                "$or": [
                    {"username": {"$regex": query, "$options": "i"}},
                    {"name": {"$regex": query, "$options": "i"}},
                ]
            }
        ).limit(10)

        user_list = [
            {"username": user.username, "name": user.name, "email": user.email}
            for user in users
        ]

        return Response({"users": user_list}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response(
            {
                "error": "Failed to search users.",
                "details": str(e) if settings.DEBUG else None,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _require_admin(user):
    """Helper to ensure the requesting user is an admin/superuser"""
    if getattr(user, "role", None) == "admin" or getattr(user, "is_superuser", False):
        return None
    return Response({"error": "Access denied. Admin privileges required."}, status=status.HTTP_403_FORBIDDEN)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_lawyer_list_view(request):
    """List lawyers for admin review, optionally filtered by verification status"""
    access_denied = _require_admin(request.user)
    if access_denied is not None:
        return access_denied

    status_filter = request.query_params.get("status", "").strip()

    try:
        # Debugging step: Count profiles by status
        status_counts = {}
        for profile in LawyerProfile.objects().only('verification_status'):
            profile_status = profile.verification_status if profile.verification_status else "unknown"
            status_counts[profile_status] = status_counts.get(profile_status, 0) + 1
        print(f"DEBUG: LawyerProfile Status Counts in DB: {status_counts}")

        if status_filter in ("pending", "approved", "rejected"):
            all_profiles = LawyerProfile.objects(verification_status=status_filter)
        else:
            all_profiles = LawyerProfile.objects()
            
        valid_profiles = []
        for profile in all_profiles:
            try:
                # Accessing profile.user will trigger dereference and raise DoesNotExist if user is missing
                if profile.user:
                    valid_profiles.append(profile)
            except DoesNotExist:
                # Optionally log this, or delete the orphaned profile
                print(f"Warning: Orphaned LawyerProfile found and skipped: {profile.id}")
                # profile.delete() # Uncomment to permanently remove orphaned profiles
                continue

    except Exception as e:
        return Response(
            {"error": "Failed to load lawyer profiles.", "details": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    serializer = LawyerProfileSerializer(valid_profiles, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_lawyer_verify_view(request, lawyer_id):
    """Approve or reject a lawyer's verification as an admin"""
    access_denied = _require_admin(request.user)
    if access_denied is not None:
        return access_denied

    serializer = AdminLawyerVerificationSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    try:
        lawyer_user = User.objects(id=lawyer_id, role="lawyer").first()
    except DoesNotExist:
        lawyer_user = None

    if not lawyer_user:
        return Response({"error": "Lawyer user not found."}, status=status.HTTP_404_NOT_FOUND)

    profile = LawyerProfile.objects(user=lawyer_user).first()
    if not profile:
        return Response({"error": "Lawyer profile not found."}, status=status.HTTP_404_NOT_FOUND)

    verification_status = serializer.validated_data["verification_status"]
    verification_notes = serializer.validated_data.get("verification_notes", "").strip()

    profile.verification_status = verification_status
    profile.verification_notes = verification_notes
    if verification_status == "approved":
        profile.verified_at = datetime.utcnow()
        lawyer_user.is_lawyer_verified = True
        lawyer_user.lawyer_verification_status = "approved"
    else:
        lawyer_user.is_lawyer_verified = False
        lawyer_user.lawyer_verification_status = "rejected"

    profile.save()
    lawyer_user.save()

    return Response(
        {
            "message": f"Lawyer verification set to {verification_status}.",
            "profile": LawyerProfileSerializer(profile).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_promote_user_view(request):
    """Promote an existing user (including Google users) to a new role such as admin"""
    access_denied = _require_admin(request.user)
    if access_denied is not None:
        return access_denied

    serializer = AdminPromoteUserSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data["email"]
    new_role = serializer.validated_data["role"]

    try:
        user = User.objects(email=email).first()
    except DoesNotExist:
        user = None

    if not user:
        return Response({"error": "User not found with this email."}, status=status.HTTP_404_NOT_FOUND)

    user.role = new_role
    # For admins, also mark as staff
    if new_role == "admin":
        user.is_staff = True
    user.save()

    return Response(
        {
            "message": f"User role updated to {new_role}.",
            "user": UserSerializer(user).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_create_admin_user_view(request):
    """Create a brand new admin user in MongoDB so they can log in via the normal login page"""
    access_denied = _require_admin(request.user)
    if access_denied is not None:
        return access_denied

    serializer = AdminCreateAdminSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    try:
        admin_user = serializer.save()
    except Exception as e:
        return Response(
            {"error": "Failed to create admin user.", "details": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {
            "message": "Admin user created successfully.",
            "user": UserSerializer(admin_user).data,
        },
        status=status.HTTP_201_CREATED,
    )

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def admin_delete_lawyer_view(request, lawyer_id):
    """Allows an admin to delete a lawyer user and their associated profile."""
    access_denied = _require_admin(request.user)
    if access_denied is not None:
        return access_denied

    try:
        # First, find the User associated with the lawyer_id
        lawyer_user = User.objects(id=lawyer_id, role="lawyer").first()
        if not lawyer_user:
            return Response({"error": "Lawyer user not found."}, status=status.HTTP_404_NOT_NOT_FOUND)

        # Delete the associated LawyerProfile
        LawyerProfile.objects(user=lawyer_user).delete()
        
        # Then delete the User itself
        lawyer_user.delete()

        return Response(
            {"message": "Lawyer and their profile deleted successfully."},
            status=status.HTTP_204_NO_CONTENT,
        )
    except DoesNotExist:
        return Response({"error": "Lawyer not found."}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        traceback.print_exc()
        return Response(
            {"error": f"Failed to delete lawyer: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

