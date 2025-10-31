import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import ChangePasswordModal from "@/components/auth/ChangePasswordModal";

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (user && user.mustChangePassword) {
      setShowModal(true);
    } else if (user && !user.mustChangePassword) {
      // User doesn't need to change password, redirect to dashboard
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  const handleClose = () => {
    setShowModal(false);
    // Redirect to dashboard after password change
    setLocation("/dashboard");
  };

  if (!user || !user.mustChangePassword) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <ChangePasswordModal
        isOpen={showModal}
        onClose={handleClose}
        isRequired={true}
      />
    </div>
  );
}