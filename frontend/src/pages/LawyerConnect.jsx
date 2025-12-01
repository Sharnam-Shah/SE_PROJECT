import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/Components/ui/Card";
import { Button } from "@/Components/ui/button";
import axios from '../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import ConnectModal from '../Components/ConnectModal';

const LawyerConnect = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lawyers, setLawyers] = useState([]);
  const [filteredLawyers, setFilteredLawyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSpecialization, setSelectedSpecialization] = useState('');
  const [allSpecializations, setAllSpecializations] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLawyer, setSelectedLawyer] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchLawyers = async (pageNum = 1) => {
    try {
      setLoading(true);
      const response = await axios.get(`api/lawyer/?page=${pageNum}&page_size=4`);
      // Handle both old array format (fallback) and new paginated format
      const data = response.data;
      const newLawyers = Array.isArray(data) ? data : (data.results || []);
      const hasMoreData = Array.isArray(data) ? false : (data.has_more || false);

      if (pageNum === 1) {
        setLawyers(newLawyers);
        setFilteredLawyers(newLawyers);
        
        // Extract specializations only on initial load to avoid re-processing
        const specializations = new Set();
        newLawyers.forEach(lawyer => {
          if (lawyer.specializations && Array.isArray(lawyer.specializations)) {
            lawyer.specializations.forEach(spec => specializations.add(spec));
          }
        });
        setAllSpecializations(Array.from(specializations).sort());
      } else {
        setLawyers(prev => [...prev, ...newLawyers]);
        setFilteredLawyers(prev => [...prev, ...newLawyers]);
      }
      
      setHasMore(hasMoreData);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to load lawyers:', err);
      setError('Failed to load lawyers. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLawyers(1);
  }, []);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchLawyers(page + 1);
    }
  };

  useEffect(() => {
    if (selectedSpecialization) {
      const filtered = lawyers.filter(lawyer => 
        lawyer.specializations && 
        Array.isArray(lawyer.specializations) &&
        lawyer.specializations.some(spec => 
          spec.toLowerCase().includes(selectedSpecialization.toLowerCase())
        )
      );
      setFilteredLawyers(filtered);
    } else {
      setFilteredLawyers(lawyers);
    }
  }, [selectedSpecialization, lawyers]);

  const openConnectModal = (lawyer) => {
    setSelectedLawyer(lawyer);
    setIsModalOpen(true);
  };

  const handleConnect = async ({ message, preferredContact, preferredTime }) => {
    if (!selectedLawyer?.user?.id) return;

    if (!message || !preferredContact || !preferredTime) {
      toast.error('Please fill out all fields.');
      return;
    }

    let preferredTimeIso = null;
    if (preferredTime) {
      const parsedDate = new Date(preferredTime);
      if (Number.isNaN(parsedDate.getTime())) {
        toast.error('Please provide a valid consultation time.');
        return;
      }
      preferredTimeIso = parsedDate.toISOString();
    }

    try {
      const response = await axios.post(`api/lawyer/${selectedLawyer.user.id}/connect/`, {
        message: message || '',
        preferred_contact_method: preferredContact?.includes('@') ? 'email' : 'phone',
        preferred_contact_value: preferredContact || user?.email || '',
        preferred_time: preferredTimeIso,
      });

      if (response.data.message) {
        toast.success(response.data.message);
      } else {
        toast.success('Connection request sent!');
      }
    } catch (err) {
      console.error('Failed to connect with lawyer:', err);
      toast.error(err.response?.data?.error || 'Unable to send connection request.');
    } finally {
      setIsModalOpen(false);
    }
  };

  const handleViewProfile = (lawyerId) => {
    navigate(`/lawyer-profile/${lawyerId}`);
  };

  return (
    <>
      <div className="container mx-auto py-10 animate-fade-in">
        {/* Header Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
            <span className="text-primary text-xs font-medium">Legal Professionals</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
            Lawyer Connect
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Connect with qualified lawyers for your legal needs
          </p>
        </div>

        {/* Lawyers Grid */}
        {loading && (
          <div className="text-center text-gray-400">Loading vetted lawyers...</div>
        )}
        {error && (
          <div className="text-center text-red-400">{error}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {!loading && !error && filteredLawyers.length === 0 && (
            <div className="col-span-full text-center text-gray-400">
              {selectedSpecialization 
                ? `No lawyers found with specialization "${selectedSpecialization}".`
                : 'No verified lawyers are available yet. Please check back soon.'}
            </div>
          )}
          {filteredLawyers.map((lawyer, index) => (
            <Card
              key={lawyer.id || lawyer.user?.id || index}
              className="bg-card backdrop-blur-sm border-border hover:border-primary/60 transition-all duration-200 p-5 flex flex-col group animate-fade-in-up"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <CardHeader className="flex flex-col items-center text-center p-0 mb-4">
                {/* Profile Photo Placeholder */}
                <div className="w-20 h-20 bg-primary/20 border border-primary/30 rounded-full flex items-center justify-center mb-3 group-hover:border-primary/50 transition-all duration-200">
                  <span className="text-primary font-semibold text-base">
                    {lawyer?.user?.name
                      ? lawyer.user.name.split(' ').map(n => n[0]).join('')
                      : lawyer?.user?.username?.slice(0, 2)?.toUpperCase() || 'L'}
                  </span>
                </div>
                <CardTitle className="text-base font-semibold text-foreground mb-1 group-hover:text-primary transition-colors duration-200">
                  {lawyer?.user?.name || lawyer?.user?.username || 'Verified Lawyer'}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground group-hover:text-muted-foreground/80 transition-colors duration-200">
                  {Array.isArray(lawyer.specializations) && lawyer.specializations.length > 0
                    ? lawyer.specializations.join(', ')
                    : 'General Practice'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 mt-auto space-y-3 text-sm text-muted-foreground">
                <div className="flex flex-col gap-1">
                  {typeof lawyer.experience_years === 'number' && (
                    <p>
                      <span className="text-muted-foreground/80">Experience:</span>{' '}
                      {lawyer.experience_years} {lawyer.experience_years === 1 ? 'year' : 'years'}
                    </p>
                  )}
                  {lawyer.consultation_fee && (
                    <p>
                      <span className="text-muted-foreground/80">Consultation:</span> {lawyer.consultation_fee}
                    </p>
                  )}
                  {lawyer.education && (
                    <p>
                      <span className="text-muted-foreground/80">Education:</span> {lawyer.education}
                    </p>
                  )}
                </div>
                {/* View Profile Button */}
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => handleViewProfile(lawyer?.user?.id || lawyer.id)}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors duration-200 text-sm"
                  >
                    View Profile
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openConnectModal(lawyer)}
                    className="w-full text-primary border-primary/40 hover:bg-primary/10 hover:text-primary/90 transition-colors duration-200 text-sm"
                  >
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Load More Section */}
        {hasMore && (
          <div className="text-center mt-8">
            <Button 
              variant="outline" 
              onClick={handleLoadMore}
              disabled={loading}
              className="text-muted-foreground border-border hover:bg-card hover:border-primary/60 hover:text-foreground transition-all duration-200"
            >
              {loading ? 'Loading...' : 'Load More Lawyers'}
            </Button>
          </div>
        )}
      </div>
      {selectedLawyer && (
        <ConnectModal
          isOpen={isModalOpen}
          onOpenChange={setIsModalOpen}
          lawyer={selectedLawyer}
          onConnect={handleConnect}
        />
      )}
    </>
  );
};

export default LawyerConnect;