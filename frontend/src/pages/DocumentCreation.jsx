// DocumentCreation.jsx - cleaned and functional version
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  FileText,
  PenTool,
  Send,
  Download,
  User,
  Bot,
  Save,
  Edit,
  Eye,
  Maximize,
  Share2,
  MessageCircle,
  History,
  Menu,
  X,
} from 'lucide-react';
import axios from '../api/axios';
import { saveAs } from 'file-saver';
import '../styles/MarkdownPreview.css';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/Components/ui/Card';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Indent } from '../lib/tiptap-extensions/indent';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ShareModal from '../Components/ShareModal';
import CommentList from '../Components/Comments/CommentList';
import MenuBar from '../Components/MenuBar';
import VersionsSidebar from '../Components/VersionsSidebar';
import SignatureModal from '../Components/SignatureModal';

// Helper to convert markdown to HTML using a temporary editor
const convertMarkdownToHtml = (markdownContent) => {
  if (!markdownContent) return '';
  const tempEditor = new Editor({
    extensions: [StarterKit, Markdown, Image.configure({ inline: true }), Indent, TextAlign.configure({ types: ['heading', 'paragraph'] })],
  });
  tempEditor.commands.setContent(markdownContent, false, { contentType: 'markdown' });
  const html = tempEditor.getHTML();
  tempEditor.destroy();
  return html;
};

const DocumentCreation = () => {
  const { id: mongoConversationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const versionToLoad = queryParams.get('version');

  // State
  const [messages, setMessages] = useState([]);
  const [title, setTitle] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [finalDocument, setFinalDocument] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [versionRefreshKey, setVersionRefreshKey] = useState(0); // For refreshing versions sidebar
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [isVersionsSidebarOpen, setIsVersionsSidebarOpen] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [originalDocumentContent, setOriginalDocumentContent] = useState('');
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [documentSharedWithUsers, setDocumentSharedWithUsers] = useState([]);

  const documentRef = useRef(null);
  const ws = useRef(null);
  const chatContainerRef = useRef(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Fullscreen handling
  const toggleFullScreen = () => {
    if (!documentRef.current) return;
    if (!document.fullscreenElement) {
      documentRef.current.requestFullscreen().then(() => setIsFullScreen(true)).catch((err) => console.error('Fullscreen error:', err));
    } else {
      document.exitFullscreen().then(() => setIsFullScreen(false)).catch((err) => console.error('Exit fullscreen error:', err));
    }
  };

  useEffect(() => {
    const handleFullScreenChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  const handleShareDocument = async () => {
    if (!mongoConversationId) {
      toast('Please save the document before sharing.', { icon: 'ℹ️' });
      return;
    }
    setIsShareModalOpen(true);
  };

  // Auto‑scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Resize sidebar for large screens
  useEffect(() => {
    const handleResize = () => setSidebarOpen(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Tiptap editor instance
  const editor = useEditor({
    extensions: [StarterKit, Markdown, Image.configure({ inline: true }), Indent, TextAlign.configure({ types: ['heading', 'paragraph'] })],
    content: finalDocument,
    onUpdate: ({ editor }) => {
      const newContent = editor.getHTML();
      setFinalDocument(newContent);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'document_content_change', content: newContent }));
      }
    },
    editorProps: {
      attributes: { class: 'markdown-preview p-8 bg-card/60 border border-border/10 rounded-b-2xl backdrop-blur-xl text-foreground overflow-hidden' },
    },
  });

  // WebSocket connection
  useEffect(() => {
    if (!mongoConversationId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const accessToken = localStorage.getItem('access_token');
    let wsUrl = `${protocol}//${window.location.hostname}:8000/ws/document/${mongoConversationId}/`;
    if (accessToken) {
      wsUrl += `?token=${accessToken}`;
    }
    console.log("WebSocket connection attempt details:");
    console.log("  URL:", wsUrl);
    console.log("  Access Token (first 10 chars):", accessToken ? accessToken.substring(0, 10) : "N/A");
    const newWs = new WebSocket(wsUrl);
    ws.current = newWs;
    newWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat_stream') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.sender === 'bot') {
            return [...prev.slice(0, -1), { ...last, text: last.text + data.chunk }];
          }
          return [...prev, { sender: 'bot', text: data.chunk }];
        });
      } else if (data.type === 'chat_complete') {
        setIsGenerating(false);
        if (data.updated_document_content) setFinalDocument(data.updated_document_content);
      } else if (data.type === 'chat_error') {
        setIsGenerating(false);
        toast.error(`An error occurred: ${data.error}`);
      } else if (data.type === 'document_content_change') {
        if (data.content !== finalDocument) setFinalDocument(data.content);
      }
    };
    newWs.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast.error('WebSocket connection error. Please refresh the page.');
      setIsGenerating(false);
    };
    return () => newWs.close();
  }, [mongoConversationId, editor, finalDocument]);

  // Fetch conversation / load document versions
  const fetchConversation = useCallback(async (idToFetch) => {
    if (!idToFetch) {
      setTitle('');
      setMessages([]);
      setFinalDocument('');
      setCurrentVersion(null);
      setOriginalDocumentContent('');
      setDocumentSharedWithUsers([]);
      return;
    }
    try {
      const { data: conversation } = await axios.get(`/api/documents/conversations/${idToFetch}/`);
      setTitle(conversation.title || '');
      setMessages(conversation.messages || []);
      setDocumentSharedWithUsers(conversation.shared_with_users || []);
      if (conversation.document_versions && conversation.document_versions.length > 0) {
        let contentToLoad = '';
        let versionToSet = null;
        if (versionToLoad) {
          const specific = conversation.document_versions.find((v) => v.version_number === parseInt(versionToLoad));
          if (specific) {
            contentToLoad = specific.content;
            versionToSet = specific.version_number;
          } else {
            toast.error(`Version ${versionToLoad} not found.`);
            const latest = conversation.document_versions[conversation.document_versions.length - 1];
            contentToLoad = latest.content;
            versionToSet = latest.version_number;
          }
        } else {
          const latest = conversation.document_versions[conversation.document_versions.length - 1];
          contentToLoad = latest.content;
          versionToSet = latest.version_number;
        }
        const html = convertMarkdownToHtml(contentToLoad);
        setFinalDocument(html);
        setCurrentVersion(versionToSet);
        setOriginalDocumentContent(html);
      } else {
        setFinalDocument('');
        setCurrentVersion(null);
        setOriginalDocumentContent('');
      }
    } catch (error) {
      console.error('Error fetching conversation:', error);
      if (error.response && error.response.status === 404) {
        toast.error('Document not found. Redirecting to My Documents.');
        navigate('/my-documents');
      } else {
        toast.error('Could not load conversation.');
      }
    }
  }, [versionToLoad, navigate]);

  // Load on mount / id change
  useEffect(() => {
    fetchConversation(mongoConversationId);
  }, [mongoConversationId, versionToLoad, fetchConversation]);

  // Keep editor content in sync when finalDocument changes (e.g., version load)
  useEffect(() => {
    if (editor) {
      editor.chain().setContent(finalDocument, false).setMeta('addToHistory', false).run();
    }
  }, [finalDocument, editor]);

  // Save conversation (create or update)
  const handleSaveConversation = useCallback(async (contentOverride = null) => {
    // Ensure contentOverride is a string (the HTML content) and not an Event object
    const contentToSave = (contentOverride && typeof contentOverride === 'string') ? contentOverride : finalDocument;

    if (!title.trim()) {
      toast.error('Please provide a title for the document.');
      return;
    }
    if (contentToSave === originalDocumentContent && mongoConversationId) {
      toast('No changes made to save.', { icon: 'ℹ️' });
      return;
    }
    const payload = { title, messages, new_document_content: contentToSave };
    try {
      let idToUse = mongoConversationId;
      if (!mongoConversationId) {
        const { data } = await axios.post('/api/documents/conversations/', { title, messages, initial_document_content: contentToSave });
        idToUse = data.id;
        navigate(`/document-creation/${idToUse}`, { replace: true });
        toast.success('New Document created and saved as Version 0!');
      } else {
        await axios.put(`/api/documents/conversations/${mongoConversationId}/`, payload);
        toast.success('Document updated and new version saved!');
      }
      await fetchConversation(idToUse);
      setOriginalDocumentContent(contentToSave);
      setVersionRefreshKey(prev => prev + 1); // Trigger refresh in VersionsSidebar
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error(`Failed to save document: ${error.message}`);
    }
  }, [title, finalDocument, originalDocumentContent, mongoConversationId, messages, fetchConversation, navigate]);

  // Debounced auto‑save
  useEffect(() => {
    if (!mongoConversationId || !editor) return;
    const handler = setTimeout(() => {
      if (finalDocument !== originalDocumentContent && editor.isReady) {
        handleSaveConversation();
      }
    }, 2000);
    return () => clearTimeout(handler);
  }, [finalDocument, mongoConversationId, editor, originalDocumentContent, handleSaveConversation]);

  const handleDeleteVersion = async (convId, versionNumber) => {
    if (!convId || !versionNumber) {
      toast.error('Missing conversation ID or version number for deletion.');
      return;
    }
    try {
      const { data: conv } = await axios.get(`/api/documents/conversations/${convId}/`);
      if (conv.document_versions.length === 1 && conv.document_versions[0].version_number === versionNumber) {
        if (!window.confirm('Deleting the only version will delete the document. Continue?')) return;
      }
      await axios.delete(`/api/documents/conversations/${convId}/versions/${versionNumber}/`);
      toast.success(`Version ${versionNumber} deleted.`);
      await fetchConversation(convId);
    } catch (error) {
      console.error('Delete version error:', error);
      toast.error(error.response?.data?.error || 'Failed to delete version.');
    }
  };

  const handleDownloadPdf = async () => {
    if (!mongoConversationId) {
      toast.error('Please save the document first.');
      return;
    }
    try {
      const { data } = await axios.get(`api/utils/conversations/${mongoConversationId}/download-latest-pdf/`, { responseType: 'blob' });
      saveAs(data, `${title || 'legal_document'}.pdf`);
    } catch (error) {
      console.error('PDF download error:', error);
      toast.error(`Failed to download PDF: ${error.message}`);
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;

    // If no conversation exists yet, create one via API
    if (!mongoConversationId) {
      setIsGenerating(true);
      try {
        const { data } = await axios.post('/api/documents/conversations/chat/', {
          message: chatMessage,
          document_content: finalDocument,
        });
        navigate(`/document-creation/${data.conversation_id}`, { replace: true });
        setChatMessage('');
      } catch (error) {
        console.error('Error creating conversation:', error);
        toast.error('Failed to create document.');
        setIsGenerating(false);
      }
      return;
    }

    // For existing conversations, use WebSocket
    if (!ws.current) return;
    const newMsg = { sender: 'user', text: chatMessage };
    setMessages((prev) => [...prev, newMsg]);
    ws.current.send(JSON.stringify({ type: 'chat_message', message: chatMessage, document_content: finalDocument }));
    setChatMessage('');
    setIsGenerating(true);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSelectVersion = (version) => {
    const params = new URLSearchParams(location.search);
    params.set('version', version);
    navigate(`?${params.toString()}`, { replace: true });
    setIsVersionsSidebarOpen(false);
  };

  const handleEditTitleClick = () => {
    setTempTitle(title);
    setIsTitleEditing(true);
  };
  const handleSaveTitle = () => {
    setTitle(tempTitle);
    setIsTitleEditing(false);
  };
  const handleCancelTitleEdit = () => {
    setIsTitleEditing(false);
    setTempTitle('');
  };

  const handleDocumentSharedToChat = ({ documentId, documentTitle, shareUrl, sharedWithUser, permissionLevel }) => {
    if (!mongoConversationId) {
        toast.error('Document not saved. Cannot send chat message.');
        return;
    }
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      toast.error('Chat connection not available. Document shared, but chat message could not be sent.');
      return;
    }

    let messageText = '';
    if (shareUrl) {
      messageText = `Shared document "${documentTitle}" publicly: ${shareUrl}`;
    } else if (sharedWithUser) {
      messageText = `Shared document "${documentTitle}" with ${sharedWithUser} (${permissionLevel} access).`;
    } else {
      messageText = `Shared document "${documentTitle}".`;
    }

    const chatPayload = {
      type: 'chat_message',
      message: messageText,
      message_type: 'document', // Indicate it's a document share message
      document_id: documentId,
      document_title: documentTitle,
    };

    ws.current.send(JSON.stringify(chatPayload));
    setMessages((prev) => [...prev, { sender: 'user', text: messageText, message_type: 'document', document_id: documentId, document_title: documentTitle }]);
    toast.success('Document shared and message sent to chat!');
  };

  // Render creation UI when no conversation ID yet
  if (!mongoConversationId) {
    return (
      <div className="flex relative h-screen bg-background overflow-hidden">
        <div className="fixed inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-1000" />
        </div>
        <div className="w-full relative z-10 flex flex-col h-screen overflow-hidden">
          <div className="px-8 py-6 bg-gradient-to-r from-card/80 to-card/80 backdrop-blur-xl border-b border-border/10 flex-shrink-0">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-r from-primary to-secondary rounded-xl shadow-lg">
                    <FileText className="w-8 h-8 text-foreground" />
                  </div>
                  <h1 className="text-3xl font-bold text-foreground">Legal Document Assistant</h1>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
                <div className="flex-1 relative">
                  <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter your document title..."
                    className="pl-12 bg-input border-border/10 text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary rounded-xl h-12 text-lg backdrop-blur-sm"
                  />
                </div>
                <Button
                  onClick={handleSaveConversation}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-foreground px-8 rounded-xl shadow-lg shadow-green-500/30 transition-all hover:scale-105 h-12 whitespace-nowrap"
                >
                  <Save className="w-5 h-5 mr-2" />
                  <span className="font-semibold">Create Document</span>
                </Button>
              </div>
            </div>
          </div>
          {/* Placeholder for chat interface when creating a new doc */}
          <div className="flex-1 p-8 flex items-center justify-center overflow-hidden">
            <Card className="w-full bg-gradient-to-br from-card/60 to-card/60 backdrop-blur-xl border border-border/10 shadow-2xl rounded-2xl overflow-hidden h-full flex flex-col">
              <CardHeader className="pb-6 bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border/10 flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-r from-primary to-secondary rounded-2xl shadow-lg">
                    <MessageCircle className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-bold text-foreground">AI Assistant</CardTitle>
                    <CardDescription className="text-muted-foreground">Describe the document you want to create</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 flex-1 flex flex-col overflow-hidden">
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                      {msg.sender === 'bot' && (
                        <div className="w-6 h-6 flex-shrink-0 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
                          <Bot className="w-3 h-3 text-foreground" />
                        </div>
                      )}
                      <div className={`px-3 py-2 rounded-lg max-w-xs text-xs leading-relaxed ${msg.sender === 'user' ? 'bg-primary text-foreground' : 'bg-card text-foreground border border-border/10'}`}>
                        <div
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(convertMarkdownToHtml(msg.text)) }}
                />
                      </div>
                      {msg.sender === 'user' && (
                        <div className="w-6 h-6 flex-shrink-0 rounded-full bg-muted flex items-center justify-center">
                          <User className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isGenerating && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 flex-shrink-0 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
                        <Bot className="w-3 h-3 text-foreground animate-pulse" />
                      </div>
                      <div className="px-3 py-2 rounded-lg bg-card border border-border/10">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-4 flex-shrink-0 mt-4">
                  <Input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Describe the document you want to create..."
                    className="flex-1 bg-input border-border/10 text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary rounded-xl h-12 backdrop-blur-sm"
                    disabled={isGenerating}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={isGenerating || !chatMessage.trim()}
                    className="bg-gradient-to-r from-primary to-secondary hover:from-primary hover:to-secondary text-foreground px-8 rounded-xl shadow-lg shadow-primary/30 transition-all hover:scale-105 h-12"
                  >
                    <Send className="w-5 h-5 mr-2" />
                    <span className="font-semibold">Send</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Main document editor view
  return (
    <div className="flex relative h-[calc(100vh-var(--navbar-height))] bg-background overflow-hidden">
      <div className="fixed inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-1000" />
      </div>
      {/* Left Sidebar - Chat History */}
      <div
        className={`
          ${sidebarOpen ? 'w-3/4 max-w-xs md:w-64 lg:w-80' : 'w-0 overflow-hidden'}
          transition-all duration-300 ease-in-out
          relative
          bg-card border-r border-border/50
          flex flex-col h-full flex-shrink-0
        `}
      >
        <div className="p-4 border-b border-border/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              <span className="text-foreground font-semibold text-sm">Chat History</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors lg:hidden">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
              {msg.sender === 'bot' && (
                <div className="w-6 h-6 flex-shrink-0 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
                  <Bot className="w-3 h-3 text-foreground" />
                </div>
              )}
              <div className={`px-3 py-2 rounded-lg max-w-xs text-xs leading-relaxed ${msg.sender === 'user' ? 'bg-primary text-foreground' : 'bg-card text-foreground border border-border/10'}`}>
                <div
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(convertMarkdownToHtml(msg.text)) }}
                />
              </div>
              {msg.sender === 'user' && (
                <div className="w-6 h-6 flex-shrink-0 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
          {isGenerating && (
            <div className="flex gap-2">
              <div className="w-6 h-6 flex-shrink-0 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
                <Bot className="w-3 h-3 text-foreground animate-pulse" />
              </div>
              <div className="px-3 py-2 rounded-lg bg-card border border-border/10">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border/10 space-y-2">
          <div className="flex gap-2">
            <Input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask for changes..."
              className="flex-1 bg-input border-border/10 text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary rounded-lg h-10 text-sm backdrop-blur-sm"
              disabled={isGenerating}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isGenerating || !chatMessage.trim()}
              className="bg-primary hover:bg-primary/80 text-foreground rounded-lg h-10 w-10 p-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10 h-full overflow-hidden">
        {/* Top Bar */}
        <div className="px-6 py-4 bg-gradient-to-r from-card/80 to-card/80 backdrop-blur-xl border-b border-border/10 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-foreground/10 rounded-lg transition-all text-muted-foreground flex-shrink-0 lg:hidden">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-foreground/10 rounded-lg transition-all text-muted-foreground flex-shrink-0 hidden lg:block">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="min-w-0 flex-1 flex items-center gap-2">
              {isTitleEditing ? (
                <Input
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                  }}
                  className="text-xl lg:text-2xl font-bold bg-input border-border/50 text-foreground focus:ring-2 focus:ring-primary focus:border-primary rounded-lg h-10"
                />
              ) : (
                <h2 className="text-xl lg:text-2xl font-bold text-foreground truncate">{title || 'Your Document'}</h2>
              )}
              {mongoConversationId && (
                isTitleEditing ? (
                  <>
                    <Button size="icon" variant="ghost" onClick={handleSaveTitle} title="Save Title">
                      <Save className="w-4 h-4 text-green-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={handleCancelTitleEdit} title="Cancel Edit">
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <Button size="icon" variant="ghost" onClick={handleEditTitleClick} title="Edit Title">
                    <Edit className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)} className="border-border/20 bg-card/40 hover:bg-card/60 hover:border-border/30 text-muted-foreground rounded-lg backdrop-blur-sm transition-all text-xs lg:text-sm">
              {isEditing ? (
                <>
                  <Eye className="w-4 h-4 mr-1 lg:mr-2" />
                  <span className="hidden lg:inline">Preview</span>
                </>
              ) : (
                <>
                  <Edit className="w-4 h-4 mr-1 lg:mr-2" />
                  <span className="hidden lg:inline">Edit</span>
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setIsVersionsSidebarOpen(!isVersionsSidebarOpen); setCommentsSidebarOpen(false); }} className="border-border/20 bg-card/40 hover:bg-card/60 hover:border-border/30 text-muted-foreground rounded-lg backdrop-blur-sm transition-all text-xs lg:text-sm">
              <History className="w-4 h-4 mr-1 lg:mr-2" />
              <span className="hidden lg:inline">Versions</span>
            </Button>
            <Button variant="outline" size="sm" onClick={toggleFullScreen} className="border-border/20 bg-card/40 hover:bg-card/60 hover:border-border/30 text-muted-foreground rounded-lg backdrop-blur-sm transition-all text-xs lg:text-sm" title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}>
              <Maximize className="w-4 h-4 mr-1 lg:mr-2" />
              <span className="hidden lg:inline">{isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleShareDocument} className="border-border/20 bg-card/40 hover:bg-card/60 hover:border-border/30 text-muted-foreground rounded-lg backdrop-blur-sm transition-all text-xs lg:text-sm" title="Share Document">
              <Share2 className="w-4 h-4 mr-1 lg:mr-2" />
              <span className="hidden lg:inline">Share</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setCommentsSidebarOpen(!commentsSidebarOpen); setIsVersionsSidebarOpen(false); }} className="border-border/20 bg-card/40 hover:bg-card/60 hover:border-border/30 text-muted-foreground rounded-lg backdrop-blur-sm transition-all text-xs lg:text-sm" title="View Comments">
              <MessageCircle className="w-4 h-4 mr-1 lg:mr-2" />
              <span className="hidden lg:inline">Comments</span>
            </Button>
          </div>
        </div>
        {/* Document Area */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 bg-card/80 rounded-xl shadow-inner">
          {isEditing ? (
            <div className="flex-1 border border-border/10 rounded-t-xl overflow-hidden shadow-2xl flex flex-col">
              <MenuBar editor={editor} />
              <div ref={documentRef} className="flex-1 overflow-y-auto custom-scrollbar bg-card/60 p-8 markdown-preview text-foreground">
                <EditorContent editor={editor} />
              </div>
            </div>
          ) : (
            <div ref={documentRef} className="flex-1 overflow-y-auto custom-scrollbar bg-card/60 border border-border/10 rounded-xl p-8 markdown-preview shadow-2xl text-foreground">
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(finalDocument) }} />
            </div>
          )}
          {/* Bottom actions */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 pt-6 pb-6 border-t border-border/10 bg-card/80 rounded-b-xl">
            <Button variant="outline" size="sm" onClick={() => setIsSignatureModalOpen(true)} className="border-border/20 bg-card/40 hover:bg-card/60 hover:border-border/30 text-muted-foreground rounded-lg backdrop-blur-sm transition-all">
              <PenTool className="w-4 h-4 mr-2" />
              Add Signature
            </Button>
            <Button onClick={handleDownloadPdf} className="bg-gradient-to-r from-accent to-accent text-foreground rounded-lg shadow-lg shadow-accent/30 transition-all">
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button onClick={handleSaveConversation} className="bg-gradient-to-r from-primary to-secondary text-foreground rounded-lg shadow-lg shadow-primary/30 transition-all">
              <Save className="w-4 h-4 mr-2" />
              Save Version
            </Button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Comments */}
      <div className="bg-card border-l border-border/10 flex flex-col overflow-hidden h-full">
        {commentsSidebarOpen && mongoConversationId && (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-border/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                <span className="text-foreground font-semibold text-sm">Comments</span>
              </div>
              <button onClick={() => setCommentsSidebarOpen(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <CommentList documentId={mongoConversationId} />
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Versions */}
      <div
        className={`
          ${isVersionsSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
          w-3/4 max-w-xs md:w-64 lg:w-80
          transition-all duration-300 ease-in-out
          fixed top-0 bottom-0 right-0 z-[51]
          bg-card border-l border-border/10
          flex flex-col overflow-hidden h-full
        `}
        style={{ height: 'calc(100vh - var(--navbar-height))', top: 'var(--navbar-height)' }}
      >
        <VersionsSidebar
          conversationId={mongoConversationId}
          onSelectVersion={handleSelectVersion}
          onClose={() => setIsVersionsSidebarOpen(false)}
          currentVersion={currentVersion}
          onDeleteVersion={handleDeleteVersion}
          versionRefreshKey={versionRefreshKey} // New prop
        />
      </div>

      {/* Modals */}
      {isShareModalOpen && (
        <ShareModal
          documentId={mongoConversationId}
          documentTitle={title}
          onClose={() => setIsShareModalOpen(false)}
          initialSharedWithUsers={documentSharedWithUsers}
          onDocumentShared={handleDocumentSharedToChat}
        />
      )}
      {isSignatureModalOpen && (
        <SignatureModal
          onClose={() => setIsSignatureModalOpen(false)}
          onSignatureAdded={async (signatureMarkdown, partyName) => {
            if (editor) {
              // Parse markdown image to simple HTML
              const urlMatch = signatureMarkdown.match(/\((.*?)\)/);
              const imageUrl = urlMatch ? urlMatch[1] : '';
              
              // Properly construct HTML content
              let signatureHtml = '';
              if (imageUrl) {
                signatureHtml = `
                  <br><hr><br>
                  <p><img src="${imageUrl}" alt="Signature for ${partyName}" style="max-height: 100px;" /></p>
                  <p><strong>${partyName}</strong></p>
                `;
              } else {
                // Fallback if markdown parsing fails
                signatureHtml = `<p>${signatureMarkdown}</p><p><strong>${partyName}</strong></p>`;
              }

              const newContent = editor.getHTML() + signatureHtml;
              editor.commands.setContent(newContent);
              setFinalDocument(newContent);
              await handleSaveConversation(newContent);
            }
          }}
        />
      )}
    </div>
  );
};

export default DocumentCreation;
