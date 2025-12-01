import React, { useState, useEffect } from 'react';
import { Copy, X, UserPlus, Trash2, Check } from 'lucide-react';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/Card';
import { Label } from '@/Components/ui/Label';
import { Switch } from '@/Components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/Components/ui/Select';
import axios from '../api/axios';
import toast from 'react-hot-toast';

const ShareModal = ({ documentId, documentTitle, onClose, initialSharedWithUsers = [], onDocumentShared }) => {
  const [publicPermissionLevel, setPublicPermissionLevel] = useState('view');
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameToShare, setUsernameToShare] = useState('');
  const [userPermissionLevel, setUserPermissionLevel] = useState('view');
  const [sharedUsers, setSharedUsers] = useState(initialSharedWithUsers);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  useEffect(() => {
    const fetchShareSettings = async () => {
      if (!documentId) return;
      try {
        const response = await axios.get(`api/documents/conversations/${documentId}/`);
        const conversation = response.data;
        if (conversation.share_permissions) {
          setPublicPermissionLevel(conversation.share_permissions.permission_level);
        }
        setSharedUsers(conversation.shared_with_users || []);
      } catch (error) {
        console.error('Error fetching share settings:', error);
        toast.error('Failed to load share settings.');
      }
    };
    fetchShareSettings();
  }, [documentId]);

  useEffect(() => {
    const searchUsers = async () => {
      if (usernameToShare.trim().length < 2) {
        setAvailableUsers([]);
        setShowUserDropdown(false);
        return;
      }
      
      try {
        const response = await axios.get('api/auth/search-users/', {
          params: { q: usernameToShare }
        });
        setAvailableUsers(response.data.users || []);
        setShowUserDropdown(true);
      } catch (error) {
        console.error('Error searching users:', error);
        setAvailableUsers([]);
      }
    };
    
    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [usernameToShare]);

  const generateLink = async () => {
    setLoading(true);
    try {
      const response = await axios.post('api/documents/generate-share-link/', {
        document_id: documentId,
        permission_level: publicPermissionLevel,
      });
      const url = `${window.location.origin}${response.data.share_url}`;
      setShareUrl(url);
      toast.success('Public share link generated!');
      if (onDocumentShared) {
        onDocumentShared({ documentId, documentTitle, shareUrl: url });
      }
    } catch (err) {
      console.error('Error generating share link:', err);
      toast.error('Failed to generate public share link.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success('Link copied to clipboard!');
  };

  const handleShareWithUser = async () => {
    if (!usernameToShare.trim()) {
      toast.error('Please enter a username.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`api/documents/conversations/${documentId}/share-with-user/`, {
        username: usernameToShare,
        permission_level: userPermissionLevel,
      });
      toast.success(`Document shared with ${usernameToShare}!`);
      if (onDocumentShared) {
        onDocumentShared({ documentId, documentTitle, sharedWithUser: usernameToShare, permissionLevel: userPermissionLevel });
      }
      setUsernameToShare('');
      setShowUserDropdown(false);
      const response = await axios.get(`api/documents/conversations/${documentId}/`);
      setSharedUsers(response.data.shared_with_users || []);
    } catch (error) {
      console.error('Error sharing with user:', error);
      toast.error(error.response?.data?.error || 'Failed to share with user.');
    } finally {
      setLoading(false);
    }
  };

  const selectUser = (username) => {
    setUsernameToShare(username);
    setShowUserDropdown(false);
  };

  const handleRemoveUserShare = async (username) => {
    setLoading(true);
    try {
      await axios.post(`api/documents/conversations/${documentId}/share-with-user/`, {
        username: username,
        permission_level: null,
      });
      toast.success(`Access revoked for ${username}.`);
      const response = await axios.get(`api/documents/conversations/${documentId}/`);
      setSharedUsers(response.data.shared_with_users || []);
    } catch (error) {
      console.error('Error revoking access:', error);
      toast.error(error.response?.data?.error || 'Failed to revoke access.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeUserPermission = async (username, newPermissionLevel) => {
    setLoading(true);
    try {
      await axios.post(`api/documents/conversations/${documentId}/share-with-user/`, {
        username: username,
        permission_level: newPermissionLevel,
      });
      toast.success(`Permissions updated for ${username}.`);
      const response = await axios.get(`api/documents/conversations/${documentId}/`);
      setSharedUsers(response.data.shared_with_users || []);
    } catch (error) {
      console.error('Error changing permissions:', error);
      toast.error(error.response?.data?.error || 'Failed to change permissions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-lg bg-card/90 backdrop-blur-xl border-border/50 shadow-2xl animate-in zoom-in-95 duration-200">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/10 pb-4">
          <CardTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Share "{documentTitle}"
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-destructive/10 hover:text-destructive transition-colors">
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {/* Public Share Link Section */}
          <div className="space-y-4 bg-muted/30 p-4 rounded-xl border border-border/50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Public Link Access</h3>
              <div className="flex items-center space-x-2">
                <Label htmlFor="public-edit-permission" className="text-xs text-muted-foreground">Allow editing</Label>
                <Switch
                  id="public-edit-permission"
                  checked={publicPermissionLevel === 'edit'}
                  onCheckedChange={(checked) => setPublicPermissionLevel(checked ? 'edit' : 'view')}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex gap-2">
              {shareUrl ? (
                <>
                  <Input value={shareUrl} readOnly className="bg-background/50 border-border/50" />
                  <Button onClick={handleCopyToClipboard} size="icon" variant="outline" className="shrink-0">
                    <Copy className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <Button onClick={generateLink} disabled={loading} className="w-full bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                  {loading ? 'Generating...' : 'Generate Public Link'}
                </Button>
              )}
            </div>
          </div>

          {/* Share with Specific Users Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Share with People</h3>
            <div className="flex flex-col gap-2">
              <div className="relative w-full">
                <Input
                  type="text"
                  placeholder="Enter username..."
                  value={usernameToShare}
                  onChange={(e) => setUsernameToShare(e.target.value)}
                  onFocus={() => usernameToShare.length >= 2 && setShowUserDropdown(true)}
                  onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
                  disabled={loading}
                  className="bg-background/50 border-border/50 w-full"
                />
                {showUserDropdown && availableUsers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border/50 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {availableUsers.map((user) => (
                      <div
                        key={user.username}
                        onClick={() => selectUser(user.username)}
                        className="px-3 py-2 hover:bg-primary/10 cursor-pointer flex items-center gap-2"
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-xs font-bold text-primary">
                          {user.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{user.username}</p>
                          {user.name && <p className="text-xs text-muted-foreground">{user.name}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Select value={userPermissionLevel} onValueChange={setUserPermissionLevel} disabled={loading}>
                  <SelectTrigger className="w-[120px] bg-background/50 border-border/50">
                    <SelectValue placeholder="Access" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleShareWithUser} disabled={loading || !usernameToShare.trim()} className="bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-md">
                  <UserPlus className="w-4 h-4 mr-2" /> Share
                </Button>
              </div>
            </div>

            {/* List of Shared Users */}
            {sharedUsers.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">People with access</p>
                {sharedUsers.map((user) => (
                  <div key={user.username} className="flex items-center justify-between bg-card/50 border border-border/50 p-3 rounded-lg hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-xs font-bold text-primary">
                        {user.username.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-sm">{user.username}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={user.permission_level}
                        onValueChange={(newLevel) => handleChangeUserPermission(user.username, newLevel)}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-[90px] h-8 text-xs bg-transparent border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">View</SelectItem>
                          <SelectItem value="edit">Edit</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveUserShare(user.username)}
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShareModal;
