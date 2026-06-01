import apiClient from '../client';

export const vehicleApi = {
  getAvailable(params) {
    return apiClient.get('/api/vehicles/available/list', { params });
  },
  getNearby(params) {
    return apiClient.get('/api/vehicles/nearby/list', { params });
  },
  getAdminVehicles(params = {}) {
    return apiClient.get('/api/vehicles/admin/list', { params });
  },
  getSearchList(params) {
    return apiClient.get('/api/vehicles/search/list', { params });
  },
  getSuggestions(q, limit = 6) {
    return apiClient.get('/api/vehicles/search/suggestions', {
      params: { q, limit }
    });
  },
  getById(vehicleId) {
    return apiClient.get(`/api/vehicles/${vehicleId}`);
  },
  getOwnerVehicles(ownerId, params = { page: 1, limit: 50 }) {
    return apiClient.get(`/api/vehicles/owner/${ownerId}/list`, { params });
  },
  create(formData) {
    return apiClient.post('/api/vehicles', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  update(vehicleId, payload) {
    return apiClient.put(`/api/vehicles/${vehicleId}`, payload);
  },
  delete(vehicleId) {
    return apiClient.delete(`/api/vehicles/${vehicleId}`);
  },
  updateAvailability(vehicleId, is_available) {
    return apiClient.put(`/api/vehicles/${vehicleId}/availability`, { is_available });
  }
};
