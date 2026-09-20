import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const ProfilePage = () => {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      // Load user profile data
      const fetchUserData = async () => {
        try {
          const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/users/${user.id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            setProfileData(data);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchUserData();
    }
  }, [user]);

  const handleEditProfile = () => {
    // This would typically open a modal or navigate to an edit page
    alert('Edit profile functionality would be implemented here');
  };

  const handleLogout = () => {
    // This would trigger the logout function from AuthContext
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="card">
        <h2>Profile</h2>
        <p>No profile data available.</p>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="card">
        <h1 className="card-title">Profile</h1>
        
        <div className="profile-info">
          <h2>{profileData.username}</h2>
          <p><strong>@{profileData.username}</strong></p>
          <p>ID: {profileData.id}</p>
          <p>Balance: {profileData.balance?.toLocaleString()} AMP</p>
          <p>Total Deposited: {profileData.totalDeposited?.toLocaleString()} AMP</p>
          <p>Games Played: {profileData.gamesPlayed || 0}</p>
          <p>Games Won: {profileData.gamesWon || 0}</p>
          <p>Games Lost: {profileData.gamesLost || 0}</p>
          <p>Member Since: {new Date(profileData.createdAt).toLocaleDateString()}</p>
        </div>

        <div className="profile-actions">
          <button 
            className="btn btn-secondary"
            onClick={handleEditProfile}
          >
            Edit Profile
          </button>
          <button 
            className="btn btn-danger"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>

        <div className="inventory-section">
          <h3>Your Inventory ({profileData.inventory?.length || 0} items)</h3>
          <p>You don't have any items in your inventory yet.</p>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;