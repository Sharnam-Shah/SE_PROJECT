import axios from 'axios';

const instance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ||   'http://localhost:8000/', // Your backend URL
        timeout: 180000, // Optional: timeout after 180 seconds (3 minutes)
    headers: {
        'Content-Type': 'application/json',
    }
});

// Request interceptor to add the JWT token to headers
instance.interceptors.request.use(
    (config) => {
        const publicUrls = ['/auth/signup/', '/auth/login/', '/auth/google/', '/auth/verify-otp/', '/auth/resend-otp/']; // Add other public URLs as needed
        const isPublicUrl = publicUrls.some(url => config.url.includes(url));

        if (isPublicUrl) {
            delete config.headers.Authorization;
            config.headers.Authorization = undefined; // Explicitly set to undefined
        } else {
            const accessToken = localStorage.getItem('access_token');
            if (accessToken) {
                config.headers.Authorization = `Bearer ${accessToken}`;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle token refreshing
instance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If error status is 401 and it's not a retry of the refresh token request
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true; // Mark request as retried

            const refreshToken = localStorage.getItem('refresh_token');

            if (refreshToken) {
                try {
                    const response = await axios.post(
                        new URL('api/auth/token/refresh/', instance.defaults.baseURL).href,
                        { refresh: refreshToken }
                    );

                    const newAccessToken = response.data.access;
                    localStorage.setItem('access_token', newAccessToken);

                    // Update the Authorization header for the original request
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

                    // Retry the original request
                    return instance(originalRequest);
                } catch (refreshError) {
                    console.error('Token refresh failed:', refreshError);
                    // If refresh token is invalid or expired, log out the user
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    // Optionally, redirect to login page or show a message
                    // window.location.href = '/login'; // This might cause issues with React Router, better to handle in AuthContext
                    return Promise.reject(refreshError);
                }
            } else {
                // No refresh token available, just reject the error
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                return Promise.reject(error);
            }
        }

        return Promise.reject(error);
    }
);

export default instance;
