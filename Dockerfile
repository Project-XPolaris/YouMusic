FROM node:18.20.4 AS builder
WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 只复制依赖相关文件，利用缓存
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 复制源码并构建
COPY . .
RUN pnpm run build

# 生产镜像
FROM node:18.20.4-alpine
WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 只复制依赖和构建产物
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD ["pnpm", "run", "start:prod"]
