import requests


async def fetch(url):
    return requests.get(url).text