'use strict';

var debugs = require('debug')
  , debug = debugs('bigpipe::primus');

/**
 * Our real-time glue layer.
 *
 * @param {Spark} spark A new real-time connection has been made.
 * @api private
 */
module.exports = function connection(spark) {
  var pipe = this;

  debug('new real-time connection: %s', spark.id);

  //
  // The orchestrate "substream" is used to sync state back and forth between
  // a client and our BigPipe server. It allows us to know which pagelets are
  // available on a given page and even which page we're currently viewing.
  //
  var orchestrate = spark.substream('pipe::orchestrate')
    , pagelets = Object.create(null)
    , page;

  orchestrate.on('data', function orchestration(data) {
    switch (data.type) {
      //
      // The user has initiated a new Page so we need to get a new reference
      // to that page so we can get the correct pagelet instances.
      //
      case 'page':
        if (page) page.emit('free');

        //
        // As part of setting a new Page instance, we need to release the
        // previously added pagelet
        //
        Object.keys(pagelets).forEach(function free(name) {
          pagelets[name].emit('free');
          delete pagelets[name];
        });

        spark.request.url = data.url || spark.request.url;
        pipe.find(spark.request, spark, data.id, function found(err, p) {
          if (err) return debug('Failed to initialise a page %j', err);

          debug('initialised page for connection %s', spark.id);

          p.req = spark.request;
          p.res = spark;
          page = p;
        });
      break;

      //
      // The user has initialised a new pagelet for a given page.
      //
      case 'pagelet':
        if (data.name in pagelets) return debug('Pagelet %s is already initialised', data.name);
        if (!page) return debug('No initialised page, cannot initialise pagelet %j', data);
        if (!page.has(data.name)) return debug('Unknown pagelet, does not exist on page');

        page.get(data.name).connect(spark, function substream(err, pagelet) {
          pagelets[data.name] = pagelet;
        });
      break;
    }
  });

  //
  // The current page id was sent with the connection string, so initialise
  // a new Page instantly using the given id.
  //
  if (spark.query._bp_pid) orchestrate.emit('data', {
    id: spark.query._bp_pid,
    type: 'page'
  });
};
