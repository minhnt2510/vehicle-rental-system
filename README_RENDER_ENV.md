# README Render ENV

## Render dashboard thao tác chung

`Render Dashboard -> chọn service -> Environment -> Add/Edit env vars -> Save Changes -> Manual Deploy -> Deploy latest commit`

## Deploy order

1. `rentcar-user-service`
2. `rentcar-vehicle-service`
3. `rentcar-rental-service`
4. `rentcar-contract-service`
5. `rentcar-payment-service`
6. `rentcar-image-service`
7. `rentcar-review-service`
8. `rentcar-tracking-service`
9. `rentcar-dispute-service`
10. `rentcar-notification-service`
11. `rentcar-statistic-service`
12. `rentcar-ai-service`
13. `rentcar-ai-agent-service`
14. `rentcar-api-gateway`
15. `rentcar-web` (Cloudflare Pages)

## Render service: rentcar-user-service

```env
NODE_ENV=production
PORT=3001
USER_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_user_db?retryWrites=true&w=majority
JWT_PRIVATE_KEY=<single-line-private-key-with-\n>
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
JWT_EXPIRES_IN=7d
IMAGE_SERVICE_URL=https://<rentcar-image-service>.onrender.com
SERVICE_TOKEN=<internal-service-token>
```

## Render service: rentcar-vehicle-service

```env
NODE_ENV=production
PORT=3002
VEHICLE_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_vehicle_db?retryWrites=true&w=majority
REDIS_URL=redis://:<password>@<redis-host>:6379
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
IMAGE_SERVICE_URL=https://<rentcar-image-service>.onrender.com
USER_SERVICE_URL=https://<rentcar-user-service>.onrender.com
AI_SERVICE_URL=https://<rentcar-ai-service>.onrender.com
SERVICE_TOKEN=<internal-service-token>
```

## Render service: rentcar-rental-service

```env
NODE_ENV=production
PORT=3003
RENTAL_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_rental_db?retryWrites=true&w=majority
RABBITMQ_URI=amqps://<user>:<password>@<rabbit-host>/<vhost>
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
VEHICLE_SERVICE_URL=https://<rentcar-vehicle-service>.onrender.com
USER_SERVICE_URL=https://<rentcar-user-service>.onrender.com
CONTRACT_SERVICE_URL=https://<rentcar-contract-service>.onrender.com
PAYMENT_SERVICE_URL=https://<rentcar-payment-service>.onrender.com
SERVICE_TOKEN=<internal-service-token>
SAGA_MAX_RETRY=2
SAGA_RETRY_DELAY_MS=3000
```

## Render service: rentcar-contract-service

```env
NODE_ENV=production
PORT=3004
CONTRACT_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_contract_db?retryWrites=true&w=majority
RABBITMQ_URI=amqps://<user>:<password>@<rabbit-host>/<vhost>
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
IMAGE_SERVICE_URL=https://<rentcar-image-service>.onrender.com
SERVICE_TOKEN=<internal-service-token>
```

## Render service: rentcar-payment-service

```env
NODE_ENV=production
PORT=3005
PAYMENT_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_payment_db?retryWrites=true&w=majority
RABBITMQ_URI=amqps://<user>:<password>@<rabbit-host>/<vhost>
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
```

## Render service: rentcar-tracking-service

```env
NODE_ENV=production
PORT=3006
TRACKING_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_tracking_db?retryWrites=true&w=majority
RABBITMQ_URI=amqps://<user>:<password>@<rabbit-host>/<vhost>
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
```

## Render service: rentcar-image-service

```env
NODE_ENV=production
PORT=3007
IMAGE_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_image_db?retryWrites=true&w=majority
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
SERVICE_TOKEN=<internal-service-token>
USE_LOCAL_IMAGE_STORAGE=false
AWS_ACCESS_KEY_ID=<aws-access-key-id>
AWS_SECRET_ACCESS_KEY=<aws-secret-access-key>
AWS_REGION=ap-southeast-2
AWS_BUCKET_NAME=s3-bucket-vehicle-rental-system
```

## Render service: rentcar-dispute-service

```env
NODE_ENV=production
PORT=3008
DISPUTE_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_dispute_db?retryWrites=true&w=majority
RABBITMQ_URI=amqps://<user>:<password>@<rabbit-host>/<vhost>
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
CONTRACT_SERVICE_URL=https://<rentcar-contract-service>.onrender.com
```

## Render service: rentcar-review-service

```env
NODE_ENV=production
PORT=3009
REVIEW_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_review_db?retryWrites=true&w=majority
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
```

## Render service: rentcar-notification-service

```env
NODE_ENV=production
PORT=3010
NOTIFICATION_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_notification_db?retryWrites=true&w=majority
RABBITMQ_URI=amqps://<user>:<password>@<rabbit-host>/<vhost>
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
```

## Render service: rentcar-statistic-service

```env
NODE_ENV=production
PORT=3011
STATISTIC_MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/rentcar_statistic_db?retryWrites=true&w=majority
REDIS_URL=redis://:<password>@<redis-host>:6379
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
```

## Render service: rentcar-ai-service

```env
PORT=5010
NODE_ENV=production
STATISTIC_SERVICE_URL=https://<rentcar-statistic-service>.onrender.com
REVIEW_SERVICE_URL=https://<rentcar-review-service>.onrender.com
VEHICLE_SERVICE_URL=https://<rentcar-vehicle-service>.onrender.com
RENTAL_SERVICE_URL=https://<rentcar-rental-service>.onrender.com
INSPECTION_SERVICE_URL=https://<inspection-service>.onrender.com
USER_SERVICE_URL=https://<rentcar-user-service>.onrender.com
GEMINI_API_KEY=<gemini-api-key>
OPENAI_API_KEY=<optional-openai-key>
```

## Render service: rentcar-ai-agent-service

```env
PORT=5011
NODE_ENV=production
VEHICLE_SERVICE_URL=https://<rentcar-vehicle-service>.onrender.com
RENTAL_SERVICE_URL=https://<rentcar-rental-service>.onrender.com
AI_AGENT_TIMEOUT_MS=8000
GEMINI_API_KEY=<gemini-api-key>
OPENAI_API_KEY=<optional-openai-key>
```

## Render service: rentcar-api-gateway

```env
NODE_ENV=production
PORT=8000
JWT_PUBLIC_KEY=<single-line-public-key-with-\n>
JWT_ALGORITHM=RS256
CORS_ORIGINS=https://<your-pages-domain>.pages.dev,http://localhost:5173,http://127.0.0.1:5173

USER_SERVICE_URL=https://<rentcar-user-service>.onrender.com
VEHICLE_SERVICE_URL=https://<rentcar-vehicle-service>.onrender.com
RENTAL_SERVICE_URL=https://<rentcar-rental-service>.onrender.com
CONTRACT_SERVICE_URL=https://<rentcar-contract-service>.onrender.com
PAYMENT_SERVICE_URL=https://<rentcar-payment-service>.onrender.com
TRACKING_SERVICE_URL=https://<rentcar-tracking-service>.onrender.com
DISPUTE_SERVICE_URL=https://<rentcar-dispute-service>.onrender.com
REVIEW_SERVICE_URL=https://<rentcar-review-service>.onrender.com
NOTIFICATION_SERVICE_URL=https://<rentcar-notification-service>.onrender.com
STATISTIC_SERVICE_URL=https://<rentcar-statistic-service>.onrender.com
AI_SERVICE_URL=https://<rentcar-ai-service>.onrender.com
AI_AGENT_SERVICE_URL=https://<rentcar-ai-agent-service>.onrender.com
IMAGE_SERVICE_URL=https://<rentcar-image-service>.onrender.com
```

## Render service: rentcar-web (Cloudflare Pages variables)

```env
VITE_API_BASE_URL=https://<your-api-gateway-render-url>/api
VITE_GOOGLE_MAPS_API_KEY=<google-maps-api-key>
VITE_GEMINI_API_KEY=<gemini-api-key>
```

> `your-api-gateway-render-url` chính là URL public của service gateway trên Render, ví dụ: `https://vehicle-rental-system-4.onrender.com`.

