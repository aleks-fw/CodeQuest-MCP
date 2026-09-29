def format_price(cents: int) -> str:
    dollars, rest = divmod(cents, 100)
    return f"${dollars}.{rest:02d}"