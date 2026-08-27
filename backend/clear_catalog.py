import asyncio
from app.db.mongodb import connect_mongodb, get_db, close_mongodb

async def run():
    await connect_mongodb()
    db = get_db()
    items = await db.catalog_items.find({}).to_list(None)
    for i in items:
        print("Found:", i["name"])
    await db.catalog_items.delete_many({})
    print("Deleted all catalog items.")
    await close_mongodb()

if __name__ == "__main__":
    asyncio.run(run())
