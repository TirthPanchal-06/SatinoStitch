function errorHandler(err, req, res, next) {
  console.error('[Unhandled Error]', err.stack || err.message || err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal atelier server error. Please try again.';

  res.status(status).json({
    error: message,
    status
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: `API endpoint ${req.method} ${req.originalUrl} not found in SATINOSTITCH registry.`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};

