function translatePlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeSql(sql) {
  return translatePlaceholders(sql)
    .replace(/datetime\('now', '-30 minutes'\)/g, "(NOW() - INTERVAL '30 minutes')")
    .replace(/datetime\('now', '-5 seconds'\)/g, "(NOW() - INTERVAL '5 seconds')")
    .replace(/datetime\('now', '-6 seconds'\)/g, "(NOW() - INTERVAL '6 seconds')")
    .replace(/datetime\('now', '-31 minutes'\)/g, "(NOW() - INTERVAL '31 minutes')")
    .replace(/date\('now'\)/g, 'CURRENT_DATE')
    .replace(/date\(\$(\d+)\)/g, '$$$1::date');
}

function withLimitOne(sql) {
  const trimmed = sql.trim().replace(/;+\s*$/, '');

  if (/\slimit\s+\d+\s*$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed} LIMIT 1`;
}

function withReturningId(sql) {
  const trimmed = sql.trim();

  if (!/^insert\s/i.test(trimmed) || /\sreturning\s/i.test(trimmed)) {
    return sql;
  }

  return `${sql.replace(/;+\s*$/, '')} RETURNING id`;
}

export function createPostgresAdapter({ connectionString }) {
  let pool;

  async function getPool() {
    if (!pool) {
      const { Pool } = await import('pg');
      pool = new Pool({ connectionString });
    }

    return pool;
  }

  async function query(sql, params = [], client = null) {
    const activePool = await getPool();
    const executor = client || activePool;
    return executor.query(normalizeSql(sql), params);
  }

  function createPreparedStatement(sql, client = null) {
    return {
      async get(...params) {
        const result = await query(withLimitOne(sql), params, client);
        return result.rows[0];
      },
      async all(...params) {
        const result = await query(sql, params, client);
        return result.rows;
      },
      async run(...params) {
        const result = await query(withReturningId(sql), params, client);
        return {
          lastInsertRowid: result.rows[0]?.id,
          changes: result.rowCount,
        };
      },
    };
  }

  return {
    client: 'postgres',
    prepare(sql) {
      return createPreparedStatement(sql);
    },
    async exec(sql) {
      const activePool = await getPool();
      return activePool.query(sql);
    },
    async transaction(callback) {
      const activePool = await getPool();
      const client = await activePool.connect();
      const transactionDb = {
        client: 'postgres',
        prepare(sql) {
          return createPreparedStatement(sql, client);
        },
        exec(sql) {
          return client.query(sql);
        },
      };

      try {
        await client.query('BEGIN');
        const result = await callback(transactionDb);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      if (pool) {
        await pool.end();
        pool = undefined;
      }
    },
  };
}
