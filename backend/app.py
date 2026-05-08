"""
DarkShield 后端服务入口
AI 驱动的 DeFi 风险管理系统
0G APAC Hackathon - Track 2: Agentic Trading Arena
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="DarkShield API",
    description="DeFi 风险管理 API - 0G APAC Hackathon Track 2",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
from api.routes import router as risk_router
app.include_router(risk_router)

@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "ok", "service": "dark-shield", "version": "1.0.0"}

@app.get("/")
async def root():
    return {
        "message": "DarkShield API - DeFi Risk Shield",
        "docs": "/docs",
        "github": "https://github.com/your-org/dark-shield"
    }
