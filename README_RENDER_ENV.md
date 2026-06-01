# Render Environment Setup (Atlas per service)

This project uses one MongoDB Atlas cluster with one database per microservice.

## 1) Deploy order on Render

1. `rentcar-user-service`
2. `rentcar-vehicle-service`
3. `rentcar-rental-service`
4. `rentcar-contract-service`
5. `rentcar-payment-service`
6. `rentcar-image-service`
7. `rentcar-tracking-service`
8. `rentcar-dispute-service`
9. `rentcar-review-service`
10. `rentcar-notification-service`
11. `rentcar-statistic-service`
12. `rentcar-ai-service` and `rentcar-ai-agent-service` (optional)
13. `rentcar-api-gateway`
14. Frontend (Cloudflare Pages)

## 2) How to apply env values on Render

For each service:

1. Open service in Render dashboard.
2. Go to **Environment**.
3. Click **Add from .env**.
4. Paste the matching template from root files:
   - `render-user-service.env`
   - `render-vehicle-service.env`
   - `render-rental-service.env`
   - `render-contract-service.env`
   - `render-payment-service.env`
   - `render-image-service.env`
   - `render-tracking-service.env`
   - `render-dispute-service.env`
   - `render-review-service.env`
   - `render-notification-service.env`
   - `render-statistic-service.env`
   - `render-ai-service.env`
   - `render-ai-agent-service.env`
   - `render-api-gateway.env`
5. Replace placeholder values (`<...>`) with real secrets.
6. Click **Save Changes**.
7. Click **Manual Deploy** -> **Deploy latest commit**.

## 3) Important notes

- Do not put MongoDB credentials in source code.
- Do not commit real `.env` files.
- `api-gateway` must use the latest Render URLs of all backend services.
- Frontend only needs:
  - `VITE_API_BASE_URL=https://<gateway>/api`
  - optional map/AI keys
- Use `/health` to verify each service after deploy.
