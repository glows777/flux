# Docker 部署指南

## 快速启动

### 启动服务（应用 + PostgreSQL）

```bash
# 构建并启动所有服务
docker compose up -d

# 查看日志
docker compose logs -f

# 仅查看应用日志
docker compose logs -f app

# 仅查看数据库日志
docker compose logs -f postgres
```

服务启动后访问: http://localhost:3000

### 停止服务

```bash
# 停止所有服务
docker compose down

# 停止并删除数据卷（警告：会删除数据库数据）
docker compose down -v
```

## 数据库管理

### 运行数据库迁移

```bash
# 应用已在启动时自动运行 prisma migrate deploy
# 手动运行迁移
docker compose exec app bunx prisma migrate deploy
```

### 创建新迁移（开发环境）

```bash
# 在容器中运行
docker compose exec app bunx prisma migrate dev --name migration_name
```

### 直接访问 PostgreSQL

```bash
# 进入 PostgreSQL 容器
docker compose exec postgres psql -U flux_user -d flux_os
```

## 环境配置

默认配置:
- **数据库用户**: flux_user
- **数据库密码**: flux_password
- **数据库名称**: flux_os
- **应用端口**: 3000
- **数据库端口**: 5432

修改配置请编辑 `docker-compose.yml` 中的环境变量。

## 开发模式

### 仅启动数据库

```bash
# 启动 PostgreSQL
docker compose up -d postgres

# 本地开发时使用此连接字符串
DATABASE_URL="postgresql://flux_user:flux_password@localhost:5432/flux_os?schema=public"

# 运行开发服务器
bun run dev
```

## 生产部署建议

### 1. 使用环境变量文件

创建 `.env.production`:

```env
POSTGRES_USER=your_secure_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=flux_os
DATABASE_URL=postgresql://your_secure_user:your_secure_password@postgres:5432/flux_os?schema=public
```

修改 `docker-compose.yml`:

```yaml
services:
  postgres:
    env_file: .env.production
  app:
    env_file: .env.production
```

### 2. 数据持久化

数据卷 `postgres_data` 已配置，确保数据库数据持久化。

### 3. 健康检查

PostgreSQL 已配置健康检查，应用会等待数据库就绪后再启动。

### 4. 日志管理

```bash
# 查看实时日志
docker compose logs -f

# 限制日志输出行数
docker compose logs --tail=100 -f
```

## 故障排查

### 应用无法连接数据库

```bash
# 检查 PostgreSQL 是否健康
docker compose ps

# 检查网络连接
docker compose exec app ping postgres
```

### 清理并重建

```bash
# 停止所有服务
docker compose down

# 删除镜像并重建
docker compose build --no-cache

# 重新启动
docker compose up -d
```

### 查看构建日志

```bash
docker compose build app
```

## 性能优化

### 多阶段构建

Dockerfile 使用多阶段构建:
- **deps**: 安装依赖（缓存层）
- **builder**: 构建应用
- **runner**: 精简的生产镜像

### 镜像大小

```bash
# 查看镜像大小
docker images | grep flux
```

## 安全建议

1. **不要在生产环境使用默认密码**
2. **使用 secrets 管理敏感信息**（Docker Swarm/Kubernetes）
3. **定期更新基础镜像**
4. **启用 SSL/TLS** 进行数据库连接（生产环境）

