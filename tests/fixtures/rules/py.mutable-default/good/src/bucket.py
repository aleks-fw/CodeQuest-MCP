def add(item, bucket=None):
    bucket = [] if bucket is None else bucket
    bucket.append(item)
    return bucket