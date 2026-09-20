import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    robloxUsername: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, loading: authLoading } = useAuth(); // Get auth loading state

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate inputs
    if (!formData.robloxUsername.trim()) {
      setError('Please enter your Roblox Username');
      setLoading(false);
      return;
    }
    
    if (!formData.password.trim()) {
      setError('Please enter your password');
      setLoading(false);
      return;
    }

    try {
      // Use the actual login function from auth context
      const result = await login(formData);
      
      if (result.success) {
        // Navigate to dashboard
        navigate('/coinflip');
      } else {
        setError(result.message || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // If auth is loading, show a loading state
  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Login</h2>

        {error && <div className="error-message" style={{color: '#ff4d4d', marginBottom: '15px'}}>{error}</div>}
        
        <div className="form-group">
          <label htmlFor="robloxUsername" className="form-label">Roblox Username</label>
          <input
            type="text"
            id="robloxUsername"
            name="robloxUsername"
            value={formData.robloxUsername}
            onChange={handleChange}
            className="form-control"
            placeholder="Enter your Roblox Username"
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password" className="form-label">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className="form-control"
            placeholder="Enter your password"
            required
          />
        </div>
        
        <button 
          type="submit" 
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
        
        <div className="auth-links">
          <p>
            Don't have an account? <Link to="/register">Register</Link>
          </p>
        </div>
      </form>
    </div>
  );
};

export default LoginPage;