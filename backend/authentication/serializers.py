import re
from rest_framework import serializers
from .models import User
from lawyer.models import LawyerProfile
from django.contrib.auth.password_validation import validate_password

def validate_phone_number_start(value):
    """
    Validates that a mobile number starts with 6, 7, 8, or 9.
    """
    if value and not re.match(r"^[6789]\d{9}$", value):
        raise serializers.ValidationError(
            "Mobile number must start with 6, 7, 8, or 9 and be 10 digits long."
        )

class UserSerializer(serializers.Serializer):
    """Serializer for User MongoEngine Document"""

    id = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    username = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    profile_picture = serializers.URLField(read_only=True)
    cover_photo = serializers.URLField(read_only=True)  # Added cover_photo
    auth_provider = serializers.CharField(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)
    has_password = serializers.SerializerMethodField()
    
    def get_has_password(self, instance):
        return instance.password != '!'
    
    def to_representation(self, instance):
        """Convert MongoEngine document to dict"""
        return {
            'id': str(instance.id),
            'email': instance.email,
            'username': instance.username,
            'name': instance.name,
            'profile_picture': instance.profile_picture,
            'cover_photo': instance.cover_photo, # Added cover_photo
            'auth_provider': instance.auth_provider,
            'date_joined': instance.date_joined,
            'phone': instance.phone,
            'role': instance.role,
            'is_verified': instance.is_verified,
            'is_lawyer_verified': instance.is_lawyer_verified,
            'lawyer_verification_status': instance.lawyer_verification_status,
            'has_password': self.get_has_password(instance)
        }


class RegisterSerializer(serializers.Serializer):
    """Serializer for user registration"""

    email = serializers.EmailField(required=True)
    username = serializers.CharField(required=True, max_length=150)
    name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
    password2 = serializers.CharField(write_only=True, required=True)
    role = serializers.ChoiceField(
        choices=[("client", "Client"), ("lawyer", "Lawyer")], default="client"
    )
    phone = serializers.CharField(
        required=False, allow_blank=True, max_length=20, validators=[validate_phone_number_start]
    )
    license_number = serializers.CharField(
        required=False, allow_blank=True, max_length=120
    )
    bar_council_id = serializers.CharField(
        required=False, allow_blank=True, max_length=120
    )
    education = serializers.CharField(required=False, allow_blank=True, max_length=255)
    experience_years = serializers.IntegerField(required=False, min_value=0)
    law_firm = serializers.CharField(required=False, allow_blank=True, max_length=255)
    specializations = serializers.ListField(
        child=serializers.CharField(max_length=120), required=False, allow_empty=True
    )
    consultation_fee = serializers.CharField(
        required=False, allow_blank=True, max_length=120
    )
    bio = serializers.CharField(required=False, allow_blank=True)
    verification_documents = serializers.ListField(
        child=serializers.CharField(max_length=512), required=False, allow_empty=True
    )

    def validate_email(self, value):
        """Check if email already exists"""
        if not value:
            raise serializers.ValidationError("Email address is required.")

        # Basic email format validation
        if "@" not in value or "." not in value.split("@")[-1]:
            raise serializers.ValidationError("Please enter a valid email address.")

        # Check if email already exists
        try:
            if User.objects(email=value).first():
                raise serializers.ValidationError(
                    "An account with this email already exists. Please use a different email or try logging in."
                )
        except Exception as e:
            if "already exists" in str(e):
                raise
            raise serializers.ValidationError(
                "Unable to validate email. Please try again."
            )

        return value.lower().strip()

    def validate_username(self, value):
        """Check if username already exists and validate format"""
        if not value:
            raise serializers.ValidationError("Username is required.")

        if len(value) < 3:
            raise serializers.ValidationError(
                "Username must be at least 3 characters long."
            )

        if len(value) > 150:
            raise serializers.ValidationError(
                "Username must not exceed 150 characters."
            )

        # Check for valid characters (alphanumeric, underscore, hyphen)
        import re

        if not re.match(r"^[a-zA-Z0-9_-]+$", value):
            raise serializers.ValidationError(
                "Username can only contain letters, numbers, underscores, and hyphens."
            )

        # Check if username already exists
        try:
            if User.objects(username=value).first():
                raise serializers.ValidationError(
                    "This username is already taken. Please choose a different username."
                )
        except Exception as e:
            if "already taken" in str(e):
                raise
            raise serializers.ValidationError(
                "Unable to validate username. Please try again."
            )

        return value.strip()

    def validate_specializations(self, value):
        if isinstance(value, str):
            items = [item.strip() for item in value.split(",") if item.strip()]
            return items
        return value or []

    def validate_verification_documents(self, value):
        if isinstance(value, str):
            items = [item.strip() for item in value.split(",") if item.strip()]
            return items
        return value or []

    def validate_experience_years(self, value):
        if value in (None, ""):
            return 0
        return value

    def validate(self, attrs):
        """Validate password match and lawyer-specific fields"""
        # Validate password match
        password = attrs.get("password", "")
        password2 = attrs.get("password2", "")
        errors = {}

        # Check if passwords are provided
        if not password or not password2:
            errors["password"] = "Password is required."
            raise serializers.ValidationError(errors)

        # Validate password strength using Django's validators FIRST
        # This will catch common passwords, numeric passwords, etc.
        password_validation_errors = []
        try:
            validate_password(password)
        except Exception as e:
            # Extract all password validation errors
            if hasattr(e, "messages"):
                password_validation_errors.extend(e.messages)
            else:
                password_validation_errors.append(str(e))

        # Additional password strength validation (minimum length)
        if len(password) < 8:
            password_validation_errors.append(
                "Password must be at least 8 characters long."
            )

        # Custom password strength checks
        import re

        if not re.search(r"[A-Z]", password):
            password_validation_errors.append(
                "Password must contain at least one uppercase letter."
            )

        if not re.search(r"[a-z]", password):
            password_validation_errors.append(
                "Password must contain at least one lowercase letter."
            )

        if not re.search(r"[0-9]", password):
            password_validation_errors.append(
                "Password must contain at least one number."
            )

        if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;/`~]', password):
            password_validation_errors.append(
                "Password must contain at least one special character (!@#$%^&*etc.)."
            )

        # If there are password validation errors, set them
        if password_validation_errors:
            errors["password"] = " ".join(password_validation_errors)

        # Check if passwords match (separate error for password2 field)
        if password != password2:
            errors["password2"] = (
                "Passwords do not match. Please ensure both passwords are identical."
            )

        # If there are any password errors, raise them now
        if errors:
            raise serializers.ValidationError(errors)

        # Validate lawyer-specific fields
        role = attrs.get("role", "client")
        if role == "lawyer":
            missing_fields = []
            field_labels = {
                "license_number": "License Number",
                "bar_council_id": "Bar Council ID",
            }

            license_number = attrs.get("license_number", "").strip()
            bar_council_id = attrs.get("bar_council_id", "").strip()

            if not license_number:
                missing_fields.append("license_number")
            if not bar_council_id:
                missing_fields.append("bar_council_id")

            if missing_fields:
                error_dict = {}
                for field in missing_fields:
                    error_dict[field] = (
                        f"{field_labels[field]} is required for lawyer registration."
                    )
                raise serializers.ValidationError(error_dict)

        return attrs

    def create(self, validated_data):
        """Create new user"""
        validated_data.pop("password2")
        role = validated_data.pop("role", "client")
        phone = validated_data.pop("phone", "")
        license_number = validated_data.pop("license_number", "")
        bar_council_id = validated_data.pop("bar_council_id", "") # Explicitly pop
        education = validated_data.pop("education", "")
        experience_years = validated_data.pop("experience_years", 0)
        law_firm = validated_data.pop("law_firm", "")
        specializations = validated_data.pop("specializations", []) or []
        consultation_fee = validated_data.pop("consultation_fee", "")
        bio = validated_data.pop("bio", "")
        verification_documents = validated_data.pop("verification_documents", []) or []

        user = User.create_user(
            email=validated_data["email"],
            username=validated_data["username"],
            name=validated_data.get("name", ""),
            password=validated_data["password"],
            role=role,
            phone=phone,
        )

        if role == "lawyer":
            user.lawyer_verification_status = "pending"
            user.is_lawyer_verified = False
            user.save()
            LawyerProfile.objects(user=user).delete()
            LawyerProfile.objects.create(
                user=user,
                phone=phone,
                education=education,
                experience_years=experience_years or 0,
                law_firm=law_firm,
                specializations=specializations,
                license_number=license_number,
                bar_council_id=bar_council_id,
                consultation_fee=consultation_fee,
                bio=bio,
                verification_documents=verification_documents,
                verification_status="pending",
            )
        else:
            user.lawyer_verification_status = "not_applicable"
            user.save()
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(
        required=True,
        error_messages={
            "required": "Email address is required.",
            "invalid": "Please enter a valid email address.",
        },
    )
    password = serializers.CharField(
        required=True,
        write_only=True,
        error_messages={
            "required": "Password is required.",
            "blank": "Password cannot be empty.",
        },
    )

    def validate_email(self, value):
        """Validate and normalize email"""
        if not value:
            raise serializers.ValidationError("Email address is required.")
        return value.lower().strip()

    def validate_password(self, value):
        """Validate password is not empty"""
        if not value or not value.strip():
            raise serializers.ValidationError("Password is required.")
        return value


class GoogleAuthSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
    role = serializers.CharField(required=False, default="client")


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    otp_code = serializers.CharField(required=True, max_length=6, min_length=6)


class ResendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class UserProfileSerializer(serializers.Serializer):
    """Serializer for updating user profile"""

    name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    profile_picture = serializers.URLField(required=False, allow_blank=True, max_length=255)
    cover_photo = serializers.URLField(required=False, allow_blank=True, max_length=255) # Added cover_photo
    role = serializers.CharField(read_only=True)

    def update(self, instance, validated_data):
        instance.name = validated_data.get("name", instance.name)
        instance.profile_picture = validated_data.get(
            "profile_picture", instance.profile_picture
        )
        instance.cover_photo = validated_data.get(
            "cover_photo", instance.cover_photo
        )  # Added cover_photo
        instance.save()
        return instance


class LawyerProfileSerializer(serializers.Serializer):
    """Serializer for lawyer public profile"""

    id = serializers.CharField(read_only=True)
    user = UserSerializer(read_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, validators=[validate_phone_number_start])
    education = serializers.CharField(required=False, allow_blank=True)
    experience_years = serializers.IntegerField(required=False, min_value=0)
    law_firm = serializers.CharField(required=False, allow_blank=True)
    specializations = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    license_number = serializers.CharField(required=True)
    consultation_fee = serializers.CharField(required=False, allow_blank=True)
    bio = serializers.CharField(required=False, allow_blank=True)
    verification_documents = serializers.ListField(
        child=serializers.CharField(max_length=512), required=False, allow_empty=True
    )
    verification_status = serializers.CharField(read_only=True)
    verification_notes = serializers.CharField(read_only=True)

    def update(self, instance, validated_data):
        """Update existing lawyer profile"""
        instance.phone = validated_data.get("phone", instance.phone)
        instance.education = validated_data.get("education", instance.education)
        instance.experience_years = validated_data.get("experience_years", instance.experience_years)
        instance.law_firm = validated_data.get("law_firm", instance.law_firm)
        instance.specializations = validated_data.get("specializations", instance.specializations)
        instance.license_number = validated_data.get("license_number", instance.license_number)
        instance.consultation_fee = validated_data.get("consultation_fee", instance.consultation_fee)
        instance.bio = validated_data.get("bio", instance.bio)
        instance.verification_documents = validated_data.get("verification_documents", instance.verification_documents)
        
        # If status was not_submitted, set to pending on submission
        if instance.verification_status == 'not_submitted':
             instance.verification_status = 'pending'
             
        instance.save()
        return instance

    def create(self, validated_data):
        """Create new lawyer profile"""
        user = validated_data.pop('user')
        # Remove bar_council_id if it's empty, as it's no longer required by the model
        bar_council_id = validated_data.pop('bar_council_id', '').strip()
        if not bar_council_id:
            bar_council_id = "" # Ensure it's an empty string if not provided
             
        if LawyerProfile.objects(user=user).first():
             raise serializers.ValidationError("Profile already exists for this user.")
             
        profile = LawyerProfile(user=user, bar_council_id=bar_council_id, **validated_data)
        profile.verification_status = 'pending'
        profile.save()
        return profile

    def to_representation(self, instance):
        user_data = None
        try:
            if instance.user:
                user_data = UserSerializer(instance.user).data
        except DoesNotExist:
            # Handle cases where the referenced user does not exist
            pass
            
        return {
            "id": str(instance.id),
            "user": user_data,
            "phone": instance.phone,
            "education": instance.education,
            "experience_years": instance.experience_years,
            "law_firm": instance.law_firm,
            "specializations": instance.specializations,
            "license_number": instance.license_number,
            "consultation_fee": instance.consultation_fee,
            "bio": instance.bio,
            "verification_status": instance.verification_status,
            "verification_notes": instance.verification_notes,
            "verification_documents": instance.verification_documents,
        }


class LawyerConnectionRequestSerializer(serializers.Serializer):
    """Serializer for lawyer connection requests"""

    id = serializers.CharField(read_only=True)
    client = UserSerializer(read_only=True)
    lawyer = UserSerializer(read_only=True)
    message = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(read_only=True)
    preferred_time = serializers.DateTimeField(required=False, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def to_representation(self, instance):
        return {
            "id": str(instance.id),
            "client": UserSerializer(instance.client).data if instance.client else None,
            "lawyer": UserSerializer(instance.lawyer).data if instance.lawyer else None,
            "message": instance.message,
            "status": instance.status,
            "preferred_time": (
                instance.preferred_time.isoformat() if instance.preferred_time else None
            ),
            "created_at": (
                instance.created_at.isoformat() if instance.created_at else None
            ),
            "updated_at": (
                instance.updated_at.isoformat() if instance.updated_at else None
            ),
        }


class LawyerConnectionStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["accepted", "declined"])
    message = serializers.CharField(required=False, allow_blank=True)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    otp_code = serializers.CharField(required=True, max_length=6, min_length=6)
    new_password = serializers.CharField(
        write_only=True, required=True
    )
    confirm_password = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        """Validate password match"""
        new_password = attrs.get("new_password")
        confirm_password = attrs.get("confirm_password")

        if new_password != confirm_password:
            raise serializers.ValidationError(
                {"confirm_password": "Password fields didn't match."}
            )
        
        try:
            validate_password(new_password)
        except Exception as e:
            raise serializers.ValidationError({"new_password": list(e.messages)})

        return attrs

class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change"""
    current_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])
    new_password2 = serializers.CharField(required=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError({"new_password": "New passwords didn't match."})
        return attrs

class AddPasswordSerializer(serializers.Serializer):
    """Serializer for adding a password to a Google-authenticated user"""
    new_password = serializers.CharField(required=True, validators=[validate_password])
    new_password2 = serializers.CharField(required=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError({"new_password": "New passwords didn't match."})
        return attrs


class AdminLawyerVerificationSerializer(serializers.Serializer):
    """Serializer for admin to approve/reject lawyer verification"""

    verification_status = serializers.ChoiceField(choices=["approved", "rejected"])
    verification_notes = serializers.CharField(required=False, allow_blank=True)


class AdminPromoteUserSerializer(serializers.Serializer):
    """Serializer for promoting an existing user to a new role (e.g., admin)"""

    email = serializers.EmailField(required=True)
    role = serializers.ChoiceField(
        choices=[("client", "Client"), ("lawyer", "Lawyer"), ("admin", "Admin")],
        default="admin",
    )


class AdminCreateAdminSerializer(serializers.Serializer):
    """Serializer for creating a new admin user via admin dashboard"""

    email = serializers.EmailField(required=True)
    username = serializers.CharField(required=True, max_length=150)
    name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])

    def validate_email(self, value):
        if User.objects(email=value).first():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower().strip()

    def validate_username(self, value):
        if User.objects(username=value).first():
            raise serializers.ValidationError("This username is already taken.")
        return value.strip()

    def create(self, validated_data):
        user = User.create_user(
            email=validated_data["email"],
            username=validated_data["username"],
            name=validated_data.get("name", ""),
            password=validated_data["password"],
            role="admin",
            is_staff=True,
        )
        return user