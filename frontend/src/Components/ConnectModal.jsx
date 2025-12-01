import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/Components/ui/dialog';
import { Button } from '@/Components/ui/button';
import { Input } from '@/Components/ui/Input';
import { Label } from '@/Components/ui/Label';
import { Textarea } from '@/Components/ui/textarea';

const ConnectModal = ({ isOpen, onOpenChange, lawyer, onConnect }) => {
  const [message, setMessage] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [error, setError] = useState('');

  const validateDateTime = (dateTimeString) => {
    if (!dateTimeString) return true; 
    const selectedDate = new Date(dateTimeString);
    const now = new Date();
    
    if (selectedDate < now) {
      return false;
    }
    return true;
  };

  const handleSubmit = () => {
    setError('');
    
    if (preferredTime && !validateDateTime(preferredTime)) {
      setError('Please select a future date and time');
      return;
    }
    
    onConnect({
      message,
      preferredTime,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Connect with {lawyer?.user?.name || 'Lawyer'}</DialogTitle>
          <DialogDescription>
            Send a connection request with your details.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="message" className="text-right">
              Message
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="col-span-3"
              placeholder="A short note for the lawyer (optional)"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="time" className="text-right">
              Time
            </Label>
            <div className="col-span-3">
              <Input
                id="time"
                type="datetime-local"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className={error ? 'border-red-500' : ''}
              />
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSubmit}>Send Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectModal;
