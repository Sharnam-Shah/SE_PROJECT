import React, { useState, useEffect } from "react";
import { User, Mail, Camera, Edit2, Check, X, Sparkles, Lock } from "lucide-react";
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import axios from '../api/axios';
import PasswordModal from '../Components/PasswordModal'; // Import the new modal

const Profile = () => {
  const { user, loading, setUser } = useAuth();
  const [profileData, setProfileData] = useState({
    name: '',
    username: '',
    email: '',
    profile_picture: '',
    cover_photo: '',
    new_profile_picture: null,
    new_cover_photo: null,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewCoverImage, setPreviewCoverImage] = useState(null);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false); // State for modal visibility

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        username: user.username || '',
        email: user.email || '',
        profile_picture: user.profile_picture || '',
        cover_photo: user.cover_photo || '',
        new_profile_picture: null,
        new_cover_photo: null,
      });
    }
  }, [user]);

  const handleInputChange = (e) => {
    setProfileData({ ...profileData, [e.target.name]: e.target.value });
  };

  const handleProfileFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileData({ ...profileData, new_profile_picture: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCoverFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileData({ ...profileData, new_cover_photo: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewCoverImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('name', profileData.name);
      if (profileData.new_profile_picture) {
        formData.append('profile_picture', profileData.new_profile_picture);
      }
      if (profileData.new_cover_photo) {
        formData.append('cover_photo', profileData.new_cover_photo);
      }

      const response = await axios.patch('api/auth/profile/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      toast.success('Profile updated successfully!');
      setUser(response.data);
      setIsEditing(false);
      setPreviewImage(null);
      setPreviewCoverImage(null);
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error(error.response?.data?.error || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setPreviewImage(null);
    setPreviewCoverImage(null);
    if (user) {
      setProfileData({
        name: user.name || '',
        username: user.username || '',
        email: user.email || '',
        profile_picture: user.profile_picture || '',
        cover_photo: user.cover_photo || '',
        new_profile_picture: null,
        new_cover_photo: null,
      });
    }
  };

  // This function will now be passed to the modal
  const handlePasswordSubmit = async (payload, endpoint) => {
    try {
      const response = await axios.post(endpoint, payload);
      toast.success(response.data.message);
      setUser({ ...user, has_password: true }); // Update has_password status
      // No need to reset passwordForm state here, modal handles its own state
    } catch (error) {
      console.error('Failed to change/add password:', error);
      console.log('Full error response:', error.response);

      let errorMessage = 'Failed to update password.';
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (typeof error.response.data === 'object') {
          const messages = [];
          for (const key in error.response.data) {
            if (Array.isArray(error.response.data[key])) {
              messages.push(...error.response.data[key]);
            } else if (typeof error.response.data[key] === 'string') {
              messages.push(error.response.data[key]);
            }
          }
          if (messages.length > 0) {
            errorMessage = messages.join(' ');
          } else if (error.response.data.error) {
            errorMessage = error.response.data.error;
          }
        }
      }
      toast.error(errorMessage);
      throw error; // Re-throw to prevent modal from closing on error
    }
  };

  const getInitials = (name) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="p-4 bg-destructive/10 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <User className="w-10 h-10 text-destructive" />
          </div>
          <p className="text-destructive text-lg">Please log in to view your profile.</p>
        </div>
      </div>
    );
  }

  const displayImage = previewImage || profileData.profile_picture;

  return (
    <div className="min-h-screen bg-background py-12 px-4 relative overflow-hidden">
      {/* Animated background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-full border border-primary/20 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Your Profile
            </span>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">Account Settings</h1>
          <p className="text-muted-foreground">Manage your personal information</p>
        </div>

        {/* Profile Card */}
        <div className="bg-card/40 backdrop-blur-xl rounded-3xl border border-border/50 overflow-hidden shadow-2xl">
          {/* Cover Image */}
          <div className="h-48 relative group">
            {profileData.cover_photo || previewCoverImage ? (
              <img 
                src={previewCoverImage || profileData.cover_photo} 
                alt="Cover" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-primary via-secondary to-accent flex items-center justify-center">
                <span className="text-foreground text-xl font-semibold">No Cover Photo</span>
              </div>
            )}
            
            <div className="absolute inset-0 bg-black/20"></div>
            {isEditing && (
              <label 
                htmlFor="cover-photo-upload" 
                className="absolute bottom-4 right-4 p-1.5 bg-input/70 rounded-lg cursor-pointer hover:bg-input transition-all duration-200 flex items-center gap-2 text-foreground text-sm font-medium z-10"
              >
                <Camera className="w-4 h-4" />
                Change Cover
                <input 
                  id="cover-photo-upload" 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleCoverFileChange} 
                />
              </label>
            )}
          </div>

          {/* Profile Content */}
          <div className="px-8 pb-8">
            {/* Avatar Section */}
            <div className="relative -mt-16 mb-6">
              <div className="relative inline-block">
                <div className="w-32 h-32 rounded-2xl bg-background border-4 border-border overflow-hidden shadow-xl">
                  {displayImage ? (
                    <img 
                      src={displayImage} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                      <span className="text-foreground text-3xl font-bold">
                        {getInitials(profileData.name || profileData.username)}
                      </span>
                    </div>
                  )}
                </div>
                
                {isEditing && (
                  <label 
                    htmlFor="profile-picture-upload" 
                    className="absolute bottom-2 right-2 p-1.5 bg-gradient-to-br from-primary to-secondary rounded-lg cursor-pointer hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 group"
                  >
                    <Camera className="w-4 h-4" />
                    Change Profile
                    <input 
                      id="profile-picture-upload" 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleProfileFileChange} 
                    />
                  </label>
                )}
              </div>

              {/* Edit Button (Top Right) */}
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="absolute right-0 top-0 px-4 py-2 bg-input/50 hover:bg-input border border-border/50 rounded-xl text-foreground text-sm font-medium transition-all duration-200 flex items-center gap-2 group"
                >
                  <Edit2 className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                  Edit Profile
                </button>
              )}
            </div>

            {/* Profile Info */}
            <div className="space-y-6">
              {/* Name Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  Full Name
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    name="name"
                    value={profileData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-input border border-border/50 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    placeholder="Enter your full name"
                  />
                ) : (
                  <div className="px-4 py-3 bg-input/30 border border-border/50 rounded-xl">
                    <p className="text-foreground text-lg font-medium">
                      {profileData.name || 'Not provided'}
                    </p>
                  </div>
                )}
              </div>

              {/* Username Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <User className="w-4 h-4 text-secondary" />
                  Username
                </label>
                <div className="px-4 py-3 bg-input/30 border border-border/50 rounded-xl">
                  <p className="text-muted-foreground flex items-center gap-2">
                    <span className="text-muted-foreground">@</span>
                    {profileData.username || 'Not provided'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Username cannot be changed</p>
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4 text-accent" />
                  Email Address
                </label>
                <div className="px-4 py-3 bg-input/30 border border-border/50 rounded-xl">
                  <p className="text-muted-foreground">{profileData.email || 'Not provided'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Email is verified and cannot be changed</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <div className="flex gap-3 mt-8 pt-6 border-t border-border/50">
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-input/50 hover:bg-input border border-border/50 rounded-xl text-foreground font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 rounded-xl text-foreground font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Password Management Section */}
            <div className="mt-8 pt-6 border-t border-border/50">
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
                <Lock className="w-6 h-6 text-primary" />
                Password Management
              </h2>

              <div className="flex gap-3">
                {user.auth_provider === 'google' && !user.has_password && (
                  <button
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 rounded-xl text-foreground font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40"
                  >
                    Add Password
                  </button>
                )}
                {(user.auth_provider === 'email' || (user.auth_provider === 'google' && user.has_password)) && (
                  <button
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 rounded-xl text-foreground font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40"
                  >
                    Change Password
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {user && (
        <PasswordModal
          isOpen={isPasswordModalOpen}
          onOpenChange={setIsPasswordModalOpen}
          user={user}
          onPasswordSubmit={handlePasswordSubmit}
        />
      )}
    </div>
  );
};

export default Profile;