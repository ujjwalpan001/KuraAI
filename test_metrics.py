import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta

async def test():
    client = AsyncIOMotorClient("mongodb+srv://admin:admin@cluster0.mongodb.net/test?retryWrites=true&w=majority") # wait, I don't know the URI.
    # let's just mock a dictionary
    t = {"name": "Test"}
    print(t.get("custom_statuses", ["PENDING", "PROCESSING"]))

asyncio.run(test())
