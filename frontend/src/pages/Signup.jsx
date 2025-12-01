import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from '../api/axios';
import toast from 'react-hot-toast';
import { GoogleLoginButton } from '@/Components/ui/GoogleLoginButton';
import { useAuth } from '../context/AuthContext';
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/Input";
import { Label } from "@/Components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/Components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/Components/ui/Select";

const STATE_CODES = [
  { value: 'AP', label: 'Andhra Pradesh' },
  { value: 'AS', label: 'Assam' },
  { value: 'AR', label: 'Arunachal Pradesh' },
  { value: 'BR', label: 'Bihar' },
  { value: 'DL', label: 'Delhi' },
  { value: 'GJ', label: 'Gujarat' },
  { value: 'GA', label: 'Goa' },
  { value: 'HP', label: 'Himachal Pradesh' },
  { value: 'HR', label: 'Haryana' },
  { value: 'JH', label: 'Jharkhand' },
  { value: 'JK', label: 'Jammu & Kashmir' },
  { value: 'LA', label: 'Ladakh' },
  { value: 'KA', label: 'Karnataka' },
  { value: 'KL', label: 'Kerala' },
  { value: 'MP', label: 'Madhya Pradesh' },
  { value: 'MH', label: 'Maharashtra' },
  { value: 'MN', label: 'Manipur' },
  { value: 'ML', label: 'Meghalaya' },
  { value: 'NL', label: 'Nagaland' },
  { value: 'MZ', label: 'Mizoram' },
  { value: 'OR', label: 'Odisha' },
  { value: 'PB', label: 'Punjab' },
  { value: 'PY', label: 'Puducherry' },
  { value: 'RJ', label: 'Rajasthan' },
  { value: 'SK', label: 'Sikkim' },
  { value: 'TN', label: 'Tamil Nadu' },
  { value: 'TS', label: 'Telangana' },
  { value: 'TR', label: 'Tripura' },
  { value: 'UP', label: 'Uttar Pradesh' },
  { value: 'UK', label: 'Uttarakhand' },
  { value: 'WB', label: 'West Bengal' }
];

const DEGREE_OPTIONS = [
  { value: 'LLB', label: 'LLB (3-year)' },
  { value: 'BA LLB', label: 'BA LLB' },
  { value: 'BSc LLB', label: 'BSc LLB' },
  { value: 'BCom LLB', label: 'BCom LLB' },
  { value: 'BBA LLB', label: 'BBA LLB' },
  { value: 'LLM', label: 'LLM' },
  { value: 'PhD in Law', label: 'PhD in Law' },
  { value: 'MBL', label: 'Master of Business Law (MBL)' },
  { value: 'Other', label: 'Other' }
];

const Signup = () => {
const navigate = useNavigate();
const [accountType, setAccountType] = useState('client');
const { setUser, setIsAuthenticated } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    password2: '',
    phone: '',
    license_number: '',
    education: '',
    experience_years: '',
    law_firm: '',
    specializations: '',
    consultation_fee: '',
    bio: '',
    verification_documents: ''
  });
  
  // Separate state for Enrollment Number parts
  const [enrollmentDetails, setEnrollmentDetails] = useState({
    state: '',
    serial: '',
    year: ''
  });
  const [otherDegree, setOtherDegree] = useState('');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLawyerModalOpen, setIsLawyerModalOpen] = useState(false); 
  const [isGoogleOnboarding, setIsGoogleOnboarding] = useState(false); 
  const [googleAccessToken, setGoogleAccessToken] = useState(null); 

  // Sync license_number when enrollment details change
  React.useEffect(() => {
    if (accountType === 'lawyer') {
      const { state, serial, year } = enrollmentDetails;
      setFormData(prev => ({
        ...prev,
        license_number: `${state}/${serial}/${year}`
      }));
    }
  }, [enrollmentDetails, accountType]);

  const handleEnrollmentChange = (field, value) => {
    setEnrollmentDetails(prev => ({
      ...prev,
      [field]: value
    }));
    if (errors.license_number) {
      setErrors(prev => ({ ...prev, license_number: '' }));
    }
  };

  const validateForm = (isLawyerStep = false) => {
    const newErrors = {};

    // Name validation (always required)
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-zA-Z\s]+$/.test(formData.name.trim())) {
      newErrors.name = 'Name can only contain letters and spaces';
    }

    // Email validation with trimming (always required)
    const trimmedEmail = formData.email.trim();
    if (!trimmedEmail) {
      newErrors.email = 'Email is required';
    } else if (/\s/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email without any spaces';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Username validation (always required)
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      newErrors.username = 'Invalid username. Only letters, numbers, underscores, and hyphens allowed';
    } else if (/^[^a-zA-Z0-9]+$/.test(formData.username)) {
      newErrors.username = 'Invalid username. Cannot contain only special characters';
    } else if (/^[0-9_-]+$/.test(formData.username)) {
      newErrors.username = 'Invalid username. Must contain at least one letter';
    }

    // Password validation (always required, unless Google onboarding)
    if (!isGoogleOnboarding) { // Passwords not required for Google initial signup
      if (!formData.password) {
        newErrors.password = 'Password is required';
      } else {
        const passwordErrors = [];
        
        if (formData.password.length < 8) {
          passwordErrors.push('at least 8 characters');
        }
        if (!/[A-Z]/.test(formData.password)) {
          passwordErrors.push('one uppercase letter');
        }
        if (!/[a-z]/.test(formData.password)) {
          passwordErrors.push('one lowercase letter');
        }
        if (!/[0-9]/.test(formData.password)) {
          passwordErrors.push('one number');
        }
        if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;/`~]/.test(formData.password)) {
          passwordErrors.push('one special character');
        }
        
        if (passwordErrors.length > 0) {
          newErrors.password = `Password must contain ${passwordErrors.join(', ')}`;
        }
      }

      if (formData.password !== formData.password2) {
        newErrors.password2 = 'Passwords do not match';
      }
    }

    // Phone validation - only numbers allowed (always optional)
    if (formData.phone && formData.phone.trim()) {
      const phoneDigits = formData.phone.replace(/[\s-+()]/g, '');
      if (!/^[0-9]+$/.test(phoneDigits)) {
        newErrors.phone = 'Please enter a valid phone number (numbers only)';
      } else if (phoneDigits.length !== 10) {
        newErrors.phone = 'Phone number must be exactly 10 digits';
      }
    }

    // Lawyer-specific validation, only if isLawyerStep is true
    if (accountType === 'lawyer' && isLawyerStep) {
      // Enrollment Number Validation
      if (!enrollmentDetails.state) {
        newErrors.license_number = 'State code is required';
      } else if (!enrollmentDetails.serial) {
        newErrors.license_number = 'Serial number is required';
      } else if (!enrollmentDetails.year) {
        newErrors.license_number = 'Year is required';
      } else {
        const serial = Number(enrollmentDetails.serial);
        const year = Number(enrollmentDetails.year);
        const currentYear = new Date().getFullYear();

        if (isNaN(serial) || serial < 1 || serial > 100000) {
          newErrors.license_number = 'Serial number must be between 1 and 100000';
        } else if (isNaN(year) || year < 1961 || year > currentYear) {
          newErrors.license_number = `Year must be between 1961 and ${currentYear}`;
        }
      }
      
      if (!formData.education.trim()) {
        newErrors.education = 'Education is required for lawyers';
      } else if (formData.education === 'Other') {
        if (!otherDegree.trim()) {
            newErrors.otherDegree = 'Please specify your degree';
        } else if (/[0-9]/.test(otherDegree)) { // Check for numbers
            newErrors.otherDegree = 'Degree name cannot contain numbers';
        } else if (!/^[a-zA-Z\s.,&+-]+$/.test(otherDegree.trim())) { // Broader allowed characters
            newErrors.otherDegree = 'Degree name contains invalid characters';
        }
      }

      if (formData.consultation_fee) {
        if (!/^\d+$/.test(formData.consultation_fee.toString())) {
          newErrors.consultation_fee = 'Consultation fee must be a number (in Rupees)';
        } else if (Number(formData.consultation_fee) < 0) {
          newErrors.consultation_fee = 'Consultation fee cannot be negative';
        }
      }

      if (formData.specializations) {
        // Check if any digit exists in the string
        if (/\d/.test(formData.specializations)) {
          newErrors.specializations = 'Specializations should only contain text, not numbers';
        }
      }

      if (formData.law_firm && formData.law_firm.trim()) {
        if (!/^[a-zA-Z\s&'-]+$/.test(formData.law_firm.trim())) {
          newErrors.law_firm = 'Law firm name can only contain letters, spaces, ampersands, apostrophes, and hyphens';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    // Trim email automatically
    if (name === 'email') {
      processedValue = value.trim();
    }
    
    // For phone, allow only numbers and common separators
    if (name === 'phone') {
      processedValue = value.replace(/[^0-9\s-+()]/g, '');
    }
    
    setFormData({
      ...formData,
      [name]: processedValue
    });
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: ''
      });
    }
  };

  const handleSelectChange = (name, value) => {
    setFormData({
      ...formData,
      [name]: value
    });
    
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: ''
      });
    }
  };

  const handleFinalSubmit = async () => { // Renamed from handleSubmit
    setLoading(true);
    setErrors({});

    try {
      let response;
      const headers = {};

      const payload = {
        ...formData,
        role: accountType,
      };

      // Only include password fields if not Google onboarding
      if (isGoogleOnboarding) {
        delete payload.password;
        delete payload.password2;
        headers['Authorization'] = `Bearer ${googleAccessToken}`;
      }
      
      if (accountType === 'lawyer') {
        payload.experience_years = formData.experience_years ? Number(formData.experience_years) : 0;
        
        // Use custom degree if 'Other' is selected
        if (payload.education === 'Other') {
          payload.education = otherDegree.trim();
        }

        payload.specializations = formData.specializations
          ? formData.specializations.split(',').map(item => item.trim()).filter(Boolean)
          : [];
        payload.verification_documents = formData.verification_documents
          ? formData.verification_documents.split(',').map(item => item.trim()).filter(Boolean)
          : [];
      } else {
        [
          'license_number',
          'education',
          'experience_years',
          'law_firm',
          'specializations',
          'consultation_fee',
          'bio',
          'verification_documents',
        ].forEach((field) => delete payload[field]);
      }

      if (isGoogleOnboarding) {
        // Submit to lawyer profile completion endpoint
        response = await axios.post('/api/auth/lawyer-profile-complete/', payload, { headers });
      } else {
        // Submit to regular signup endpoint
        response = await axios.post('/api/auth/signup/', payload);
      }
      
      toast.success(response.data.message);
      
      if (response.data.requires_verification) {
        navigate('/verify-otp', { state: { email: response.data.email } });
      } else {
        navigate('/login');
      }
    } catch (error) {
      console.error('Submission error:', error);
      
      if (error.response) {
        const data = error.response.data;
        
        // Handle validation errors (field-specific)
        if (data && typeof data === 'object' && !data.error) {
          const fieldErrors = {};
          let hasFieldErrors = false;
          
          Object.keys(data).forEach(key => {
            const value = data[key];
            if (Array.isArray(value)) {
              fieldErrors[key] = value[0];
              hasFieldErrors = true;
            } else if (typeof value === 'string') {
              fieldErrors[key] = value;
              hasFieldErrors = true;
            }
          });
          
          if (hasFieldErrors) {
            setErrors(fieldErrors);
            return;
          }
        }
        
        // Handle general error messages
        let message = 'Submission failed. Please try again.';
        if (typeof data === 'string') {
          message = data;
        } else if (data?.error) {
          message = data.error;
        } else if (data?.detail) {
          message = data.detail;
        }
        
        toast.error(message);
      } else if (error.request) {
        toast.error('Unable to connect to server. Please check your internet connection.');
      } else {
        toast.error('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
      setIsLawyerModalOpen(false); // Close modal on completion/error
      setIsGoogleOnboarding(false); // Reset Google onboarding state
    }
  };

  const handleSubmit = (e) => { // New handler for initial form submission
    e.preventDefault();
    if (!validateForm(isLawyerModalOpen)) { // Validate basic fields first, or all fields if modal is open
      return;
    }

    if (accountType === 'lawyer' && !isLawyerModalOpen) {
      setIsLawyerModalOpen(true); // Open modal for lawyer details
    } else {
      handleFinalSubmit(); // Directly submit for client, or from modal
    }
  };

  const handleGoogleSignup = async (tokenData) => {
    setLoading(true);
    console.log("DEBUG: handleGoogleSignup started. Selected Role:", accountType);
    try {
      if (!tokenData || !tokenData.credential) {
        toast.error('Google authentication failed. Please try again.');
        return;
      }
      
      console.log('Sending token to backend:', tokenData);
      const response = await axios.post('/api/auth/google/', { 
        token: tokenData.credential,
        role: accountType // Send selected role to backend
      });
      
      console.log('Backend response:', response.data);
      
      // Store tokens and user data
      const { access, refresh } = response.data.tokens;
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      setUser(response.data.user);
      setIsAuthenticated(true);
      
      toast.success(response.data.message || 'Signup successful!');
      
      // If the user is a lawyer and needs to complete their profile (from google auth flow)
      if (response.data.requires_lawyer_onboarding) {
        setGoogleAccessToken(access); // Save the access token for profile completion
        setIsGoogleOnboarding(true); // Indicate that we are in Google onboarding flow
        setAccountType('lawyer'); // Force account type to lawyer so payload is constructed correctly
        setIsLawyerModalOpen(true);  // Open the modal
      } else {
        navigate('/'); // Redirect to home for clients or completed lawyers
      }
      
    } catch (error) {
      console.error('Google signup error:', error);
      
      if (error.response) {
        const errorMsg = error.response.data?.error 
          || error.response.data?.details 
          || error.response.data?.detail
          || 'Google signup failed. Please try again.';
        toast.error(errorMsg);
      } else if (error.request) {
        toast.error('Unable to connect to server. Please check your internet connection.');
      } else {
        toast.error('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = (error) => {
    console.error('Google OAuth error:', error);
    toast.error('Google signup failed. Please try again.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden py-8">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none"></div>
      
      {/* Go back button */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 z-20 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 hover:bg-card/70 text-muted-foreground border border-border/50 shadow-lg backdrop-blur-md transition-all duration-200"
      >
        <span className="text-xl leading-none">←</span>
        <span className="text-sm font-medium tracking-wide uppercase opacity-90">Go back</span>
      </button>
      
      {/* Signup form card */}
      <div className="w-full max-w-md p-8 space-y-6 bg-card/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-border/50 relative z-10 animate-fade-in">
        <div className="text-center">
          <div className="inline-block mb-4 px-4 py-2 bg-primary/20 rounded-full border border-primary/30">
            <span className="text-primary text-sm font-semibold">Get Started</span>
          </div>
          <h1 className="text-4xl font-extrabold text-foreground mb-2 bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Create an account
          </h1>
          <p className="text-muted-foreground">Enter your information to create an account</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={accountType === 'client' ? 'default' : 'outline'}
            className="w-full"
            onClick={() => setAccountType('client')}
            disabled={loading}
          >
            I'm a client
          </Button>
          <Button
            type="button"
            variant={accountType === 'lawyer' ? 'default' : 'outline'}
            className="w-full"
            onClick={() => setAccountType('lawyer')}
            disabled={loading}
          >
            I'm a lawyer
          </Button>
        </div>

        <GoogleLoginButton
          onSuccess={handleGoogleSignup}
          onError={handleGoogleError}
          text="Sign up with Google"
          disabled={loading}
        />

        <div className="relative">
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card/90 px-4 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground font-medium">Name</Label>
              <Input 
                id="name" 
                name="name" 
                placeholder="John Doe" 
                required 
                value={formData.name} 
                onChange={handleInputChange} 
                disabled={loading}
                className={`bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.name ? 'border-red-500' : ''}`}
              />
              {errors.name && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                  <p className="text-xs text-red-600 dark:text-red-400">{errors.name}</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground font-medium">Username</Label>
              <Input 
                id="username" 
                name="username" 
                placeholder="johndoe" 
                required 
                value={formData.username} 
                onChange={handleInputChange} 
                disabled={loading}
                className={`bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.username ? 'border-red-500' : ''}`}
              />
              {errors.username && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                  <p className="text-xs text-red-600 dark:text-red-400">{errors.username}</p>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
            <Input 
              id="email" 
              name="email" 
              type="email" 
              placeholder="m@example.com" 
              required 
              value={formData.email} 
              onChange={handleInputChange} 
              disabled={loading}
              className={`bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.email ? 'border-red-500' : ''}`}
            />
            {errors.email && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                <p className="text-xs text-red-600 dark:text-red-400">{errors.email}</p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
            <Input 
              id="password" 
              name="password" 
              type="password" 
              placeholder="Enter password"
              required 
              value={formData.password} 
              onChange={handleInputChange} 
              disabled={loading}
              className={`bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.password ? 'border-red-500' : ''}`}
            />
            {errors.password && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mt-2">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">{errors.password}</p>
              </div>
            )}
            <div className="bg-muted/50 border border-border/30 rounded-lg p-3 mt-2">
              <p className="text-xs font-semibold text-foreground mb-2">Password must contain:</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li className={`flex items-center gap-2 ${formData.password.length >= 8 ? 'text-green-600 dark:text-green-400' : ''}`}>
                  <span className={formData.password.length >= 8 ? '✓' : '○'}>
                    {formData.password.length >= 8 ? '✓' : '○'}
                  </span>
                  At least 8 characters
                </li>
                <li className={`flex items-center gap-2 ${/[A-Z]/.test(formData.password) ? 'text-green-600 dark:text-green-400' : ''}`}>
                  <span>{/[A-Z]/.test(formData.password) ? '✓' : '○'}</span>
                  One uppercase letter (A-Z)
                </li>
                <li className={`flex items-center gap-2 ${/[a-z]/.test(formData.password) ? 'text-green-600 dark:text-green-400' : ''}`}>
                  <span>{/[a-z]/.test(formData.password) ? '✓' : '○'}</span>
                  One lowercase letter (a-z)
                </li>
                <li className={`flex items-center gap-2 ${/[0-9]/.test(formData.password) ? 'text-green-600 dark:text-green-400' : ''}`}>
                  <span>{/[0-9]/.test(formData.password) ? '✓' : '○'}</span>
                  One number (0-9)
                </li>
                <li className={`flex items-center gap-2 ${/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;/`~]/.test(formData.password) ? 'text-green-600 dark:text-green-400' : ''}`}>
                  <span>{/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;/`~]/.test(formData.password) ? '✓' : '○'}</span>
                  One special character (!@#$%^&*)
                </li>
              </ul>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password2" className="text-foreground font-medium">Confirm Password</Label>
            <Input 
              id="password2" 
              name="password2" 
              type="password" 
              placeholder="Enter password"
              required 
              value={formData.password2} 
              onChange={handleInputChange} 
              disabled={loading}
              className={`bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.password2 ? 'border-red-500' : ''}`}
            />
            {errors.password2 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-2">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
                  <span>⚠</span>
                  {errors.password2}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-foreground font-medium">Phone (optional)</Label>
            <Input
              id="phone"
              name="phone"
              placeholder="+91-XXXXXXXXXX"
              value={formData.phone}
              onChange={handleInputChange}
              disabled={loading}
              className={`bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.phone ? 'border-red-500' : ''}`}
            />
            {errors.phone && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                <p className="text-xs text-red-600 dark:text-red-400">{errors.phone}</p>
              </div>
            )}
          </div>

          <Button 
            type="submit" 
            className="w-full bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-foreground shadow-lg shadow-primary/50 hover:shadow-xl hover:shadow-primary/60 transition-all duration-300" 
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:text-primary/80 hover:underline transition-colors duration-200">
            Sign in
          </Link>
        </div>
      </div>

      {/* Lawyer Details Modal */}
      <Dialog open={isLawyerModalOpen} onOpenChange={setIsLawyerModalOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Complete Your Lawyer Profile</DialogTitle>
            <DialogDescription>
              Please provide the following details to complete your lawyer registration.
              Our team will review your credentials for verification.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleFinalSubmit(); }} className="space-y-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Professional Information</h2>
              <p className="text-xs text-muted-foreground">
                Provide accurate information so our team can verify your credentials.
              </p>
            </div>

                        <div className="space-y-2">
                                            <Label className="text-foreground font-medium">Enrollment Number *</Label>
                                            <div className="grid grid-cols-3 gap-2">
                                              <Select 
                                                name="enrollment_state" 
                                                value={enrollmentDetails.state} 
                                                onValueChange={(val) => handleEnrollmentChange('state', val)}
                                              >
                                                <SelectTrigger className="bg-input border-border/50">
                                                  <SelectValue placeholder="State" />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="max-h-[200px] overflow-y-auto">
                                                                      {STATE_CODES.map((state) => (
                                                                        <SelectItem key={state.value} value={state.value}>
                                                                          {state.label}
                                                                        </SelectItem>
                                                                      ))}
                                                                    </SelectContent>                                              </Select>
                                              
                                              <Input
                                                name="enrollment_serial"
                                                placeholder="Serial (1-100000)"
                                                type="number"
                                                min="1"
                                                max="100000"
                                                value={enrollmentDetails.serial}
                                                onChange={(e) => handleEnrollmentChange('serial', e.target.value)}
                                                className="bg-input border-border/50"
                                              />
                                              
                                              <Input
                                                name="enrollment_year"
                                                placeholder="Year (1961+)"
                                                type="number"
                                                min="1961"
                                                value={enrollmentDetails.year}
                                                onChange={(e) => handleEnrollmentChange('year', e.target.value)}
                                                className="bg-input border-border/50"
                                              />
                                            </div>                            {errors.license_number && (
                              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                                <p className="text-xs text-red-600 dark:text-red-400">{errors.license_number}</p>
                              </div>
                            )}
                          </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="education" className="text-foreground font-medium">Education (Degree) *</Label>
                <Select 
                  name="education" 
                  value={formData.education} 
                  onValueChange={(val) => handleSelectChange('education', val)}
                >
                  <SelectTrigger className={`bg-input border-border/50 ${errors.education ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select Degree" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEGREE_OPTIONS.map((degree) => (
                      <SelectItem key={degree.value} value={degree.value}>
                        {degree.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.education === 'Other' && (
                  <Input
                    placeholder="Specify Degree"
                    value={otherDegree}
                    onChange={(e) => setOtherDegree(e.target.value)}
                    onKeyDown={(e) => {
                      // Prevent numbers (0-9) from being typed
                      if (/[0-9]/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    className={`mt-2 bg-input border-border/50 ${errors.otherDegree ? 'border-red-500' : ''}`}
                  />
                )}
                {(errors.education || errors.otherDegree) && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                    <p className="text-xs text-red-600 dark:text-red-400">{errors.education || errors.otherDegree}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience_years" className="text-foreground font-medium">Years of Experience</Label>
                <Input
                  id="experience_years"
                  name="experience_years"
                  type="number"
                  min="0"
                  placeholder="e.g. 5"
                  value={formData.experience_years}
                  onChange={handleInputChange}
                  disabled={loading}
                  className="bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="law_firm" className="text-foreground font-medium">Law Firm / Practice</Label>
                <Input
                  id="law_firm"
                  name="law_firm"
                  placeholder="Firm name or Independent"
                  value={formData.law_firm}
                  onChange={handleInputChange}
                  disabled={loading}
                  className={`bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.law_firm ? 'border-red-500' : ''}`}
                />
                {errors.law_firm && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                    <p className="text-xs text-red-600 dark:text-red-400">{errors.law_firm}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="consultation_fee" className="text-foreground font-medium">Consultation Fee (₹)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    id="consultation_fee"
                    name="consultation_fee"
                    type="number"
                    min="0"
                    placeholder="1500"
                    value={formData.consultation_fee}
                    onChange={handleInputChange}
                    disabled={loading}
                    className={`pl-8 bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.consultation_fee ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.consultation_fee && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                    <p className="text-xs text-red-600 dark:text-red-400">{errors.consultation_fee}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="specializations" className="text-foreground font-medium">Specializations</Label>
              <Input
                id="specializations"
                name="specializations"
                placeholder="Separate with commas e.g. Corporate Law, Family Law"
                value={formData.specializations}
                onChange={handleInputChange}
                disabled={loading}
                className={`bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 ${errors.specializations ? 'border-red-500' : ''}`}
              />
              {errors.specializations && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 mt-1">
                  <p className="text-xs text-red-600 dark:text-red-400">{errors.specializations}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-foreground font-medium">Professional Bio</Label>
              <textarea
                id="bio"
                name="bio"
                rows="4"
                placeholder="Describe your experience, notable cases, or approach to clients."
                value={formData.bio}
                onChange={handleInputChange}
                disabled={loading}
                className="w-full rounded-md border border-border/50 bg-input text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300 p-3"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="verification_documents" className="text-foreground font-medium">Verification Documents</Label>
              <Input
                id="verification_documents"
                name="verification_documents"
                placeholder="Links to certifications or proofs (comma separated URLs)"
                value={formData.verification_documents}
                onChange={handleInputChange}
                disabled={loading}
                className="bg-input border-border/50 text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/20 transition-all duration-300"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsLawyerModalOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Submitting...' : 'Complete Registration'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Signup;