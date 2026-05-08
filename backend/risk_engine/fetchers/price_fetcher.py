"""
价格数据获取模块
从 CoinGecko 获取实时和历史价格数据
"""
import aiohttp
from typing import Dict, List, Optional
import asyncio

class PriceFetcher:
    """价格数据获取器"""

    COINGECKO_IDS = {
        "ETH": "ethereum", "WETH": "ethereum", "WBTC": "wrapped-bitcoin",
        "USDC": "usd-coin", "USDT": "tether", "DAI": "dai",
        "LINK": "chainlink", "UNI": "uniswap", "AAVE": "aave"
    }

    async def get_current_prices(self, assets: List[str]) -> Dict[str, float]:
        """获取当前价格 (USD)"""
        ids = [self.COINGECKO_IDS.get(a, a.lower()) for a in assets]
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={','.join(ids)}&vs_currencies=usd"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        reverse_map = {v: k for k, v in self.COINGECKO_IDS.items()}
                        return {
                            reverse_map.get(coin_id, coin_id): info.get("usd", 0)
                            for coin_id, info in data.items()
                        }
        except Exception as e:
            print(f"获取价格失败: {e}")
        return {a: 0.0 for a in assets}

    async def get_historical_prices(self, asset: str, days: int = 7) -> List[Dict]:
        """获取历史价格"""
        coin_id = self.COINGECKO_IDS.get(asset, asset.lower())
        url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params={"vs_currency": "usd", "days": days}, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return [{"timestamp": p[0], "price": p[1]} for p in data.get("prices", [])]
        except Exception as e:
            print(f"获取历史价格失败: {e}")
        return []
