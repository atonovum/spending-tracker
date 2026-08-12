FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 샘플 지갑 시드는 개발 모드(`vite`)면 자동으로 켜진다. 환경 변수 불필요.
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
