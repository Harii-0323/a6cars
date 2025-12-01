/**
 * A6 Cars - Global API Configuration
 * Auto-detects backend URL based on environment
 */

(function() {
  // Determine backend URL based on environment
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  let BACKEND_URL;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Local development
    BACKEND_URL = 'http://localhost:3000';
  } else if (hostname.includes('onrender.com')) {
    // On Render platform - use the actual backend URL
    BACKEND_URL = 'https://a6cars-latest.onrender.com';
  } else {
    // Production with custom domain or other platform
    BACKEND_URL = `${protocol}//api.${hostname}` || `${protocol}//backend.${hostname}`;
  }
  
  // Store in window object for all scripts to access
  window.API_CONFIG = {
    BACKEND_URL: BACKEND_URL,
    
    // API endpoint helper
    getEndpoint: function(path) {
      return this.BACKEND_URL + path;
    },
    
    // Make API request with default headers
    fetch: function(path, options = {}) {
      const url = this.getEndpoint(path);
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };
      
      // Add auth token if available
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      return fetch(url, {
        ...options,
        headers
      });
    }
  };
  
  // Log configuration in development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    console.log('🚗 A6 Cars Frontend - Local Development Mode');
    console.log('Backend URL:', window.API_CONFIG.BACKEND_URL);
  } else {
    console.log('🚗 A6 Cars Frontend - Production Mode');
    console.log('Backend URL:', window.API_CONFIG.BACKEND_URL);
  }
})();
