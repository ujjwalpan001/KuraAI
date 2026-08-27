# Gemini function calling tool definitions

TOOLS = [
    {
        "name": "get_media",
        "description": (
            "Fetch a media file (image or PDF document) from the tenant's media library "
            "when the customer asks to see, receive, or download a catalog, brochure, "
            "price list, product image, showroom photo, invoice, repair diagram, or service menu. "
            "Use this whenever the customer's request implies they want a visual or downloadable asset."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": (
                        "The keyword to look up in the media library. "
                        "Examples: 'catalog', 'sofa', 'showroom', 'price list', "
                        "'invoice', 'repair diagram', 'service menu'"
                    ),
                }
            },
            "required": ["keyword"],
        },
    },
    {
        "name": "search_catalog",
        "description": (
            "Search the visual product/service catalog and show the customer the single best-matching "
            "item — its photo AND its details (price, colors, material, delivery time) together. "
            "Use this when the customer wants to find a product by description rather than by exact name, "
            "e.g. 'show me a green leather sofa', 'do you have a marble dining table', "
            "'what beds do you have', 'I need an AC service'. To send an image, use get_media."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "What the customer is looking for, in their own words.",
                }
            },
            "required": ["description"],
        },
    },
    {
        "name": "search_knowledge",
        "description": (
            "Search the knowledge base for FACTUAL answers about policies, delivery, warranty, "
            "showrooms, payment, or general FAQs (not a specific product photo). "
            "Use for questions like 'what is your return policy', 'how long is delivery', 'where are your showrooms'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant knowledge base articles.",
                },
                "category": {
                    "type": "string",
                    "enum": ["all", "faq", "product", "pricing", "policy", "service", "document"],
                    "description": "Optional category filter to restrict search to a specific document type. Default is 'all'.",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "escalate_to_human",
        "description": (
            "Escalate this conversation to a human agent. Use ONLY when the customer "
            "expresses clear frustration, anger, distress, or dissatisfaction, "
            "or when their request is completely beyond your capability to handle. "
            "Do not use for normal questions even if difficult."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Brief reason for escalation.",
                }
            },
            "required": ["reason"],
        },
    },
    {
        "name": "place_order",
        "description": (
            "Place a new order or booking for the customer. "
            "Use this ONLY after you have collected ALL required order information from the customer as specified in your system prompt. "
            "Pass the collected information as a JSON string."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_name": {
                    "type": "string",
                    "description": "The name of the product or service being ordered."
                },
                "quantity": {
                    "type": "integer",
                    "description": "Quantity being ordered."
                },
                "collected_info": {
                    "type": "string",
                    "description": "A JSON string containing all the dynamically collected information (e.g. {\"Customer Name\": \"John\", \"Address\": \"123 St\"})."
                }
            },
            "required": ["product_name", "collected_info"],
        },
    },
    {
        "name": "submit_payment_proof",
        "description": (
            "Submit a payment verification for the customer's most recent order. "
            "Use this tool when the customer provides a Transaction ID, or when they send a screenshot/image of their payment receipt. "
            "If they just sent an image, pass 'screenshot_attached' as the transaction_id. "
            "After calling this, tell the customer their payment is sent to the finance department for verification."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "transaction_id": {
                    "type": "string",
                    "description": "The transaction ID provided by the customer, or 'screenshot_attached' if they sent an image."
                }
            },
            "required": ["transaction_id"],
        },
    },
    {
        "name": "initiate_return",
        "description": (
            "Initiate a return request for an existing order using its Order ID (e.g., ORD-12345). "
            "Use this ONLY after asking the customer for the specific reason for returning the item. "
            "The system will automatically verify if the order is eligible for return based on the purchase date (7-day window)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "The dedicated Order ID (e.g., ORD-ABC123) provided by the customer."
                },
                "reason": {
                    "type": "string",
                    "description": "The exact reason the customer wants to return the item."
                }
            },
            "required": ["order_id", "reason"],
        },
    },
    {
        "name": "check_order_status",
        "description": (
            "Check the status of a customer's order. If they ask 'where is my order' or 'has my order shipped', "
            "use this tool. The backend will automatically look up the customer's phone number."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "(Optional) The specific Order ID if the customer provided one. Otherwise, leave empty to fetch their most recent order."
                }
            },
        },
    },
    {
        "name": "cancel_order",
        "description": (
            "Attempt to cancel a customer's order. This will only succeed if the order is still within "
            "the allowed cancellation window and has not yet been shipped. The customer must provide an order ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "The dedicated Order ID (e.g., ORD-ABC123) the customer wants to cancel."
                }
            },
            "required": ["order_id"],
        },
    }
]
