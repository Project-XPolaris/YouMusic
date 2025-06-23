FROM node:18.20.4 AS builder
WORKDIR /app
COPY ./package.json ./
COPY ./pnpm-lock.yaml ./
RUN npm config set registry https://registry.npmmirror.com/ \
    && npm install -g pnpm \
    && pnpm config set registry https://registry.npmmirror.com/ \
    && pnpm install
COPY . .
RUN pnpm run build


FROM node:18.20.4-alpine
WORKDIR /app
COPY --from=builder /app ./
RUN npm config set registry https://registry.npmmirror.com/ \
    && npm install -g pnpm \
    && pnpm config set registry https://registry.npmmirror.com/ \
    && pnpm install --prod \
    && pnpm add sqlite3 \
    && pnpm add sharp --prod --platform=linuxmusl --arch=x64
CMD ["pnpm", "run", "start:prod"]
