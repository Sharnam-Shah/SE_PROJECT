import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/Card";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/Input";
import { Send, Paperclip, FileText, ArrowLeft } from 'lucide-react';

const Chat = () => {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (conversationId) {
      loadMessages();
      loadConversation();
      loadUserDocuments();
      
      // Poll for new messages every 3 seconds
      const interval = setInterval(loadMessages, 3000);
      return () => clearInterval(interval);
    }
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    try {
      console.log('Loading messages for conversation:', conversationId);
      const response = await axios.get(`api/chat/conversations/${conversationId}/messages/`);
      console.log('Messages response:', response.data);
      console.log('Number of messages:', response.data?.length || 0);
      setMessages(response.data || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
      console.error('Error details:', err.response?.data);
      if (err.response?.status !== 404) {
        toast.error(err.response?.data?.error || 'Failed to load messages.');
      }
    }
  };

  const loadConversation = async () => {
    try {
      const response = await axios.get('api/chat/conversations/');
      const conv = response.data.find(c => c.id === conversationId);
      if (conv) {
        setConversation(conv);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserDocuments = async () => {
    try {
      const response = await axios.get('api/documents/conversations/');
      console.log('DEBUG (Chat.jsx): Documents loaded:', response.data);
      setAvailableDocuments(response.data || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && !showDocumentPicker) return;
    
    setSending(true);
    try {
      console.log('Sending message:', newMessage.trim());
      const response = await axios.post(`api/chat/conversations/${conversationId}/messages/`, {
        message: newMessage.trim(),
        message_type: 'text',
      });
      console.log('Message sent successfully:', response.data);
      setNewMessage('');
      // Reload messages immediately
      await loadMessages();
      toast.success('Message sent!');
    } catch (err) {
      console.error('Failed to send message:', err);
      console.error('Error details:', err.response?.data);
      toast.error(err.response?.data?.error || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const shareDocument = async (documentId, documentTitle) => {
    setSending(true);
    console.log('DEBUG (Chat.jsx): Attempting to share document with ID:', documentId, 'Title:', documentTitle);
    try {
      await axios.post(`api/chat/conversations/${conversationId}/messages/`, {
        message: `Shared document: ${documentTitle}`,
        message_type: 'document',
        document_id: documentId,
        document_title: documentTitle,
      });
      setShowDocumentPicker(false);
      loadMessages();
      toast.success('Document shared successfully!');
    } catch (err) {
      console.error('Failed to share document:', err);
      toast.error(err.response?.data?.error || 'Failed to share document.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 animate-fade-in">
        <div className="text-center text-gray-400">Loading conversation...</div>
      </div>
    );
  }

  const otherUser = conversation?.client?.id === user?.id 
    ? conversation?.lawyer 
    : conversation?.client;

  return (
    <div className="container mx-auto py-6 h-[calc(100vh-var(--navbar-height))] flex flex-col animate-fade-in">
      <Card className="flex-1 flex flex-col bg-gray-800/40 backdrop-blur-sm border border-gray-700/50">
        <CardHeader className="border-b border-gray-700/50">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <CardTitle className="text-white">
                {otherUser?.name || otherUser?.username || 'Chat'}
              </CardTitle>
              <p className="text-sm text-gray-400">
                {conversation?.lawyer?.id === user?.id ? 'Client' : 'Lawyer'}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                <p>No messages yet. Start the conversation!</p>
              </div>
            )}
            {messages.map((msg) => {
              const senderId = msg.sender?.id || msg.sender;
              const userId = user?.id || user;
              const isOwn = String(senderId) === String(userId);
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      isOwn
                        ? 'bg-blue-600 text-white'
                        : msg.message_type === 'system'
                        ? 'bg-gray-700/50 text-gray-300 text-center mx-auto'
                        : 'bg-gray-700 text-white'
                    }`}
                  >
                    {msg.message_type === 'document' && (
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4" />
                        <a
                          href={`/documentShare/${msg.document_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:no-underline"
                        >
                          {msg.document_title || 'Document'}
                        </a>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Document Picker Modal */}
          {showDocumentPicker && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
              <Card className="w-full max-w-md bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Share Document</CardTitle>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                  {availableDocuments.length === 0 ? (
                    <p className="text-gray-400">No documents available.</p>
                  ) : (
                    <div className="space-y-2">
                      {availableDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-400" />
                            <span className="text-white">{doc.title || 'Untitled Document'}</span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => shareDocument(doc.id, doc.title || 'Untitled Document')}
                            disabled={sending}
                          >
                            Share
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => setShowDocumentPicker(false)}
                  >
                    Cancel
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t border-gray-700/50 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDocumentPicker(true)}
                className="text-gray-400 hover:text-white"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
              />
              <Button
                onClick={sendMessage}
                disabled={sending || !newMessage.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Chat;

