import logging


def load_config(path):
    try:
        return open(path).read()
    except OSError:
        logging.exception("cannot read %s", path)
        return "{}"
