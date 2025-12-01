from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from mongoengine.queryset.visitor import Q
from rest_framework.pagination import PageNumberPagination
from authentication.models import User
from .models import ChatConversation, ChatMessage
from lawyer.models import LawyerConnectionRequest

from .serializers import (
    ChatMessageSerializer,
    ChatConversationSerializer,
)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_conversations_list_view(request):
    """List all chat conversations for the authenticated user with pagination"""
    user = request.user
    connection_request_id = request.query_params.get('connection_request_id')
    
    if connection_request_id:
        # Get conversation by connection request ID
        try:
            connection_request = LawyerConnectionRequest.objects(id=connection_request_id).first()
            if not connection_request:
                return Response({'error': 'Connection request not found.'}, status=status.HTTP_404_NOT_FOUND)
            
            conversation = ChatConversation.objects(
                connection_request=connection_request,
                is_active=True
            ).first()
        except Exception as e:
            return Response({'error': f'Invalid connection request ID: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not conversation:
            if connection_request.status != 'accepted':
                return Response({'error': 'Connection request is not accepted yet.'}, status=status.HTTP_400_BAD_REQUEST)
            # Create the conversation on demand
            conversation = ChatConversation.objects.create(
                connection_request=connection_request,
                client=connection_request.client,
                lawyer=connection_request.lawyer,
                is_active=True,
            )
            ChatMessage.objects.create(
                conversation=conversation,
                sender=request.user,
                message='Conversation started.',
                message_type='system',
            )
        
        if not conversation:
            return Response({'error': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check if user is part of the conversation
        if str(conversation.client.id) != str(user.id) and str(conversation.lawyer.id) != str(user.id):
            return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = ChatConversationSerializer(conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
        
    # Efficiently query conversations for the user
    user_conversations = ChatConversation.objects(
        (Q(client=user) | Q(lawyer=user)) & Q(is_active=True)
    ).order_by('-updated_at')
    
    # Paginate the results
    paginator = PageNumberPagination()
    paginator.page_size = 15 # Set a default page size
    paginated_conversations = paginator.paginate_queryset(user_conversations, request)
    
    serializer = ChatConversationSerializer(paginated_conversations, many=True, context={'request': request})
    return paginator.get_paginated_response(serializer.data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def chat_messages_view(request, conversation_id):
    """Get messages for a conversation or send a new message"""
    conversation = ChatConversation.objects(id=conversation_id).first()
    if not conversation:
        return Response({'error': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
    
    # Check if user is part of the conversation
    user = request.user
    if str(conversation.client.id) != str(user.id) and str(conversation.lawyer.id) != str(user.id):
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
    
    if request.method == 'GET':
        messages = ChatMessage.objects(conversation=conversation).order_by('created_at')
        print(f"Found {messages.count()} messages for conversation {conversation_id}")
        
        serializer = ChatMessageSerializer(messages, many=True)
        print(f"Serialized {len(serializer.data)} messages")
        
        # Mark messages as read (exclude messages sent by current user)
        unread_messages = ChatMessage.objects(
            conversation=conversation,
            is_read=False
        )
        for msg in unread_messages:
            if str(msg.sender.id) != str(user.id):
                msg.is_read = True
                msg.save()
        
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    elif request.method == 'POST':
        print(f"DEBUG: chat_messages_view received request.data: {request.data}")
        message_text = request.data.get('message', '').strip()
        message_type = request.data.get('message_type', 'text')
        document_id = request.data.get('document_id', '')
        document_title = request.data.get('document_title', '')
        
        print(f"DEBUG: message_type: {message_type}, document_id: {document_id}, document_title: {document_title}")
        
        if not message_text and message_type != 'document':
            return Response({'error': 'Message cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        
        if message_type == 'document' and not document_id:
            return Response({'error': 'Document ID is required for document messages.'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            chat_message = ChatMessage.objects.create(
                conversation=conversation,
                sender=user,
                message=message_text or f'Shared document: {document_title}',
                message_type=message_type,
                document_id=document_id,
                document_title=document_title,
                is_read=False,
            )
            print(f"Created message {chat_message.id} in conversation {conversation_id}")
            print(f"Message content: {chat_message.message}")
            print(f"Sender: {chat_message.sender.id}")
            
            # Update conversation timestamp
            conversation.save()
            
            serializer = ChatMessageSerializer(chat_message)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            print(f"Error creating message: {e}")
            import traceback
            traceback.print_exc()
            return Response({'error': f'Failed to create message: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)