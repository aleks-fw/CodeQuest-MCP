def load_config(path):
    try:
        return open(path).read()
    except OSError:
        pass
