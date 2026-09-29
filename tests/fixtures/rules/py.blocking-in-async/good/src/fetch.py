import asyncio

import requests


async def fetch(url):
    response = await asyncio.to_thread(requests.get, url)
    return response.text