import pymysql
import pymysql.cursors

DB_CONFIG = dict(
    host="localhost",
    user="scm_app",
    password="scm_pass",
    database="supply_chain_db",
    cursorclass=pymysql.cursors.DictCursor,
    autocommit=True,
)


def get_connection():
    return pymysql.connect(**DB_CONFIG)
