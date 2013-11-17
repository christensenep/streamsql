const _ = require('lodash')
const mysql = require('mysql')
const util = require('util')
const fmt = util.format.bind(util)
const escapeId = mysql.escapeId.bind(mysql)
const escape = mysql.escape.bind(mysql)

function getFields(table, tableCache) {
  if (!tableCache[table]) {
    throw new Error('table ' + escapeId(table) + ' does not appear to be registered')
  }

  return tableCache[table].fields.map(function (field) {
    return [table,field].join('.')
  })
}

function selectWithJoinStatement(opts) {
  const table = opts.table
  const fields = opts.fields
  const relationships = opts.relationships
  const tableCache = opts.tableCache

  var allFields = fields.slice().map(function (field) {
    return [table,field].join('.')
  })

  var joinString = ''

  _.forEach(relationships, function (rel, key) {
    const otherTable = rel.table
    const joinKey = (rel.from || key)
    const joinType = rel.optional ? ' LEFT ' : ' INNER '
    allFields = allFields.concat(getFields(otherTable, tableCache))
    joinString = joinString +
      joinType + ' JOIN '+ escapeId(otherTable) +
      ' ON ' + escapeId([table, joinKey].join('.')) +
      ' = ' + escapeId([otherTable, rel.foreign].join('.'))
  })

  const escapedFields = allFields.map(function (field) {
    return escapeId(field)
  })

  return fmt('SELECT %s FROM %s %s',
             escapedFields.join(','),
             escapeId(table),
             joinString)
}

function selectStatement(opts) {
  const table = opts.table
  const fields = opts.fields
  const relationships = opts.relationships

  if (relationships) {
    return selectWithJoinStatement.apply(null, arguments)
  }

  const fieldList = fields.map(escapeId.bind(mysql)).join(',')
  return fmt('SELECT %s FROM %s', fieldList, escapeId(table))
}


function deleteStatement(table) {
  return fmt('DELETE FROM %s', escapeId(table))
}

function limitStatement(opts) {
  if (!opts || !opts.limit) { return '' }
  return fmt(' LIMIT %s ', opts.limit)
}

function whereStatement(conditions, table) {
  if (!conditions || !_.keys(conditions).length) {
    return ''
  }

  var where = ' WHERE '

  const clauses = _.keys(conditions).map(function (key) {
    const field = escapeId([table, key].join('.'))
    var cnd = conditions[key]

    // if the condition is an array, e.g { release_date: [2000, 1996] },
    // use an `in` operator.
    if (Array.isArray(cnd)) {
      cnd = cnd.map(function (x) { return escape(x) })
      return fmt('%s IN (%s)', field, cnd.join(','))
    }

    const op = cnd.operation || cnd.op || '='

    if (cnd.value) {
      cnd = cnd.value
    }

    return fmt('%s %s %s', field, op, escape(cnd))
  })

  where += clauses.join(' AND ')
  return where
}

function sortStatement(sorting) {
  if (!sorting) return ''

  // sorting can be one of three styles:
  // * implicit ascending, single: 'title'
  // * implicit ascending, multi: ['release_date', 'title']
  // * explicit: { title: 'desc', release_date: 'asc' }

  if (typeof sorting == 'string')
    return fmt(' ORDER BY %s', escapeId(sorting))

  if (Array.isArray(sorting))
    return fmt(' ORDER BY %s', sorting.map(escapeId).join(','))

  // must be an object
  return fmt(' ORDER BY %s', _.map(sorting, function (value, key) {
    return fmt('%s %s', escapeId(key), value.toUpperCase())
  }).join(','))
}

function selectQuery(opts, callback) {
  callback = callback || function(){}

  const queryString = selectStatement(opts)
    + whereStatement(opts.conditions, opts.table)
    + limitStatement(opts.limit)
    + sortStatement(opts.sort)

  const queryOpts = { sql: queryString }

  if (opts.relationships)
    queryOpts.nestTables = true

  return opts.query(queryOpts, opts.fields, callback)
}


module.exports = {
  selectQuery: selectQuery,
  selectStatement: selectStatement,
  deleteStatement: deleteStatement,
  whereStatement: whereStatement,
  limitStatement: limitStatement,
  sortStatement: sortStatement,
}