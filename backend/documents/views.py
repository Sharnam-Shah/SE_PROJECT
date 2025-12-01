import json
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import JSONParser

from documents.mongo_client import get_all_conversations, get_conversation_by_id, save_conversation, update_conversation, delete_conversation, get_document_version_content, delete_document_version, update_share_permissions, update_user_share_permissions
from channels.layers import get_channel_layer # Import get_channel_layer
from asgiref.sync import async_to_sync # Import async_to_sync
from ai_generator.utils import get_gemini_response # Import the AI generation function


from .comment_mongo_client import get_comments_for_document, add_comment, serialize_comment


@api_view(['POST'])
def create_conversation_with_chat(request):
    """
    Creates a new conversation based on an initial chat message and generates
    the first version of the document using AI.
    """
    message = request.data.get('message')
    initial_document_content = request.data.get('document_content', '') # Can be empty for initial creation
    
    if not message:
        return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Generate AI response for the initial message
        ai_raw_response = get_gemini_response(message, initial_document_content)
        
        # Parse the AI response to extract document content
        ai_response_content = ""
        if '```json' in ai_raw_response:
            json_str = ai_raw_response.split('```json')[1].split('```')[0]
            document_data = json.loads(json_str)
            ai_response_content = document_data.get('text', '')
        else:
            ai_response_content = ai_raw_response # If not JSON, treat raw response as content

        # Determine a title for the new document (can be improved)
        title = message[:50] + "..." if len(message) > 50 else message
        if not title:
            title = "New Document"

        # Prepare messages for saving
        messages = [
            {'sender': 'user', 'text': message},
            {'sender': 'bot', 'text': ai_raw_response} # Save raw AI response to messages
        ]

        # Save the new conversation
        conversation_id = save_conversation(
            title=title,
            messages=messages,
            initial_document_content=ai_response_content, # AI's parsed response is the initial document content
            uploaded_by=(request.user.username if request.user.is_authenticated else 'anonymous'),
            notes='Initial document generation via chat'
        )

        if conversation_id:
            return Response({
                'conversation_id': conversation_id,
                'response': ai_raw_response,
                'updated_document_content': ai_response_content,
                'title': title
            }, status=status.HTTP_201_CREATED)
        else:
            return Response({'error': 'Failed to create conversation'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        print(f"Error creating conversation with chat: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
def send_chat_message(request, pk):
    """
    Sends a chat message to an existing conversation, generates an AI response,
    and updates the conversation's messages and document content.
    """
    message = request.data.get('message')
    document_content = request.data.get('document_content') # Current document content as context

    if not message:
        return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

    conversation = get_conversation_by_id(pk)
    if not conversation:
        return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        # Generate AI response
        ai_raw_response = get_gemini_response(message, document_content)

        # Parse the AI response to extract document content
        ai_response_content = ""
        if '```json' in ai_raw_response:
            json_str = ai_raw_response.split('```json')[1].split('```')[0]
            document_data = json.loads(json_str)
            ai_response_content = document_data.get('text', '')
        else:
            ai_response_content = ai_raw_response # If not JSON, treat raw response as content

        # Update messages
        updated_messages = conversation.get('messages', [])
        updated_messages.append({'sender': 'user', 'text': message})
        updated_messages.append({'sender': 'bot', 'text': ai_raw_response}) # Save raw AI response to messages

        # Update conversation in DB
        success = update_conversation(
            pk,
            conversation.get('title'), # Keep existing title
            updated_messages,
            ai_response_content, # AI's parsed response is the new document content
            uploaded_by=(request.user.username if request.user.is_authenticated else 'anonymous'),
            notes='Document update via chat message'
        )

        if success:
            return Response({
                'response': ai_raw_response,
                'updated_document_content': ai_response_content
            }, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Failed to update conversation'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        print(f"Error sending chat message: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET', 'POST'])
@parser_classes([JSONParser])
def document_comments(request, document_id):
    if request.method == 'GET':
        try:
            comments = get_comments_for_document(document_id)
            import json
            json_comments = json.dumps(comments)
            return Response(json.loads(json_comments))
        except Exception as e:
            import traceback
            print(f"Error getting comments for document_id {document_id}: {e}")
            traceback.print_exc()
            return Response({'error': 'Failed to load comments. Please check server logs for details.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    elif request.method == 'POST':
        try:
            user = request.user.username if request.user.is_authenticated else 'anonymous'
            content = request.data.get('content')
            position = request.data.get('position')
            parent_comment_id = request.data.get('parent_comment')

            if not content:
                return Response({'error': 'Comment content is required'}, status=status.HTTP_400_BAD_REQUEST)

            new_comment_doc = add_comment(document_id, user, content, position, parent_comment_id)
            
            if new_comment_doc:
                serialized_comment = serialize_comment(new_comment_doc)
                # Send WebSocket message to the document group
                channel_layer = get_channel_layer()
                document_group_name = f'document_{document_id}'
                async_to_sync(channel_layer.group_send)(
                    document_group_name,
                    {
                        'type': 'new_comment',
                        'comment': serialized_comment
                    }
                )
                return Response(serialized_comment, status=status.HTTP_201_CREATED)
            return Response({'error': 'Failed to create comment'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            print(f"Error creating comment: {e}")
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def generate_share_link(request):
    """
    Generates a shareable link for a document.
    If a document_id is provided, it updates the share permissions of the existing document.
    Otherwise, it creates a new document with the provided content.
    """
    document_id = request.data.get('document_id')
    permission_level = request.data.get('permission_level', 'view')
    share_permissions = {'permission_level': permission_level}

    if document_id:
        # Update existing document
        try:
            success = update_share_permissions(document_id, share_permissions)
            if success:
                share_url = f"/documentShare/{document_id}"
                return Response({'share_url': share_url}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'Failed to update share permissions'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': f'Error generating share link: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    else:
        # Create new document
        document_content = request.data.get('document_content')
        title = request.data.get('title', 'Shared Document')

        if not document_content:
            return Response({'error': 'Document content is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            conversation_id = save_conversation(
                title=title,
                messages=[],
                initial_document_content=document_content,
                uploaded_by=(request.user.username if request.user.is_authenticated else 'anonymous'),
                notes='Shared document',
                share_permissions=share_permissions
            )
            share_url = f"/documentShare/{conversation_id}"
            return Response({'share_url': share_url}, status=status.HTTP_201_CREATED)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': f'Error generating share link: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET', 'POST'])
def conversation_list(request):
    """
    List all conversations or create a new one.
    """
    if request.method == 'GET':
        user_id = request.user.username if request.user.is_authenticated else None
        if user_id:
            conversations = get_all_conversations(user=user_id)
        else:
            # If user is not authenticated, they should not see any conversations
            conversations = []
        return Response(conversations)

    elif request.method == 'POST':
        title = request.data.get('title')
        messages = request.data.get('messages')
        initial_document_content = request.data.get('initial_document_content')
        notes = request.data.get('notes', 'Initial Version')
        shared_with_users = request.data.get('shared_with_users', []) # New: get shared_with_users

        print(f"[DEBUG Backend] conversation_list (POST) - Received messages: {messages}")

        if not title or not messages:
            return Response({'error': 'Title and messages are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        conversation_id = save_conversation(
            title=title,
            messages=messages,
            initial_document_content=initial_document_content,
            uploaded_by=(request.user.username if request.user.is_authenticated else 'anonymous'),
            notes=notes,
            shared_with_users=shared_with_users # New: pass shared_with_users
        )
        if conversation_id:
            return Response({'id': conversation_id}, status=status.HTTP_201_CREATED)
        else:
            return Response({'error': 'Failed to save conversation'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET', 'PUT', 'DELETE'])
def conversation_detail(request, pk):
    """
    Retrieve, update or delete a single conversation.
    """
    if request.method == 'GET':
        conversation = get_conversation_by_id(pk)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)

        # Logic to add user to shared_with_users if accessing via public link
        if request.user.is_authenticated:
            share_permissions = conversation.get('share_permissions')
            shared_with_users = conversation.get('shared_with_users', [])
            is_owner = conversation.get('owner') == request.user.username
            is_already_shared = any(u.get('username') == request.user.username for u in shared_with_users)

            if not is_owner and not is_already_shared and share_permissions and share_permissions.get('permission_level') in ['view', 'edit']:
                # Add user to shared_with_users with the public permission level
                update_user_share_permissions(pk, request.user.username, share_permissions.get('permission_level'))
                # Refresh conversation to reflect changes
                conversation = get_conversation_by_id(pk)

        user_has_access = False
        # 1. Check if the requesting user is the owner
        if request.user.is_authenticated and conversation.get('owner') == request.user.username:
            user_has_access = True
        
        # 2. Check public share permissions
        share_permissions = conversation.get('share_permissions')
        if share_permissions and share_permissions.get('permission_level') in ['view', 'edit']:
            user_has_access = True

        # 3. Check user-specific share permissions
        if request.user.is_authenticated:
            shared_with_users = conversation.get('shared_with_users', [])
            for shared_user in shared_with_users:
                if shared_user.get('username') == request.user.username:
                    if shared_user.get('permission_level') in ['view', 'edit']:
                        user_has_access = True
                        break
        
        if not user_has_access:
            return Response({'error': 'You do not have permission to access this document.'}, status=status.HTTP_403_FORBIDDEN)

        return Response(conversation)
    
    elif request.method == 'PUT':
        conversation = get_conversation_by_id(pk)
        if not conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check for share permissions
        share_permissions = conversation.get('share_permissions')
        if share_permissions is None:
            share_permissions = {}
        permission_level = share_permissions.get('permission_level')

        # If the user is not authenticated, only allow updates if the permission level is 'edit'
        if not request.user.is_authenticated and permission_level != 'edit':
            return Response({'error': 'You do not have permission to edit this document.'}, status=status.HTTP_403_FORBIDDEN)

        title = request.data.get('title')
        messages = request.data.get('messages')
        new_document_content = request.data.get('new_document_content')
        notes = request.data.get('notes', f'Version update via AI editor')
        shared_with_users = request.data.get('shared_with_users') # New: get shared_with_users

        print(f"[DEBUG Backend] conversation_detail (PUT) - Received messages: {messages}")

        if not title: # Title is always required for a conversation
            return Response({'error': 'Title is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Fetch existing conversation to get current messages if not provided in request
        existing_conversation = get_conversation_by_id(pk)
        if not existing_conversation:
            return Response({'error': 'Conversation not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Use existing messages if not provided in the request for a title-only update
        messages_to_update = messages if messages is not None else existing_conversation.get('messages', [])

        success = update_conversation(
            pk,
            title,
            messages_to_update,
            new_document_content,
            uploaded_by=(request.user.username if request.user.is_authenticated else 'anonymous'),
            notes=notes,
            shared_with_users=shared_with_users # New: pass shared_with_users
        )
        if success:
            return Response({'status': 'success'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Failed to update conversation'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    elif request.method == 'DELETE':
        success = delete_conversation(pk)
        if success:
            return Response(status=status.HTTP_204_NO_CONTENT)
        else:
            return Response({'error': 'Failed to delete conversation'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
def share_document_with_user(request, pk):
    """
    Adds, updates, or removes a user's share permissions for a specific document.
    Requires authentication.
    """
    if not request.user.is_authenticated:
        return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

    username_to_share_with = request.data.get('username')
    permission_level = request.data.get('permission_level') # 'view', 'edit', or None to remove

    if not username_to_share_with:
        return Response({'error': 'Username is required.'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Optional: Validate if the username_to_share_with exists in your User model
    # from authentication.models import User # Assuming User model is here
    # if not User.objects.filter(username=username_to_share_with).exists():
    #     return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Check if the requesting user is the owner of the document
    conversation = get_conversation_by_id(pk)
    if not conversation:
        return Response({'error': 'Document not found.'}, status=status.HTTP_404_NOT_FOUND)
    
    if conversation.get('owner') != request.user.username:
        return Response({'error': 'You do not have permission to share this document.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        success = update_user_share_permissions(pk, username_to_share_with, permission_level)
        if success:
            if permission_level:
                return Response({'status': f'Document shared with {username_to_share_with} with {permission_level} permissions.'}, status=status.HTTP_200_OK)
            else:
                return Response({'status': f'Share permissions for {username_to_share_with} removed.'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Failed to update share permissions.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in share_document_with_user: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def get_version_content(request, pk, version_number):
    """
    Retrieves the content of a specific document version from a conversation.
    """
    try:
        content = get_document_version_content(pk, version_number)
        if content is not None:
            return Response({'content': content}, status=status.HTTP_200_OK)
        return Response({'error': 'Version content not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"Error in get_version_content: {e}")
        return Response({'error': f'Error retrieving version content: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['DELETE'])
def version_detail(request, pk, version_number):
    """
    Delete a specific document version from a conversation.
    """
    try:
        success = delete_document_version(pk, version_number)
        if success:
            return Response(status=status.HTTP_204_NO_CONTENT)
        else:
            return Response({'error': 'Failed to delete document version or version not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"Error deleting document version in view: {e}")
        return Response({'error': f'An error occurred: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)