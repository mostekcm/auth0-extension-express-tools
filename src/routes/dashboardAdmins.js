const express = require('express');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const tools = require('auth0-extension-tools');

const urlHelpers = require('../urlHelpers');

module.exports = function(options) {
  if (!options || typeof options !== 'object') {
    throw new tools.ArgumentError('Must provide the options');
  }

  if (options.secret === null || options.secret === undefined) {
    throw new tools.ArgumentError('Must provide a valid secret');
  }

  if (typeof options.secret !== 'string' || options.secret.length === 0) {
    throw new tools.ArgumentError('The provided secret is invalid: ' + options.secret);
  }

  if (options.audience === null || options.audience === undefined) {
    throw new tools.ArgumentError('Must provide a valid audience');
  }

  if (typeof options.audience !== 'string' || options.audience.length === 0) {
    throw new tools.ArgumentError('The provided audience is invalid: ' + options.audience);
  }

  if (options.rta === null || options.rta === undefined) {
    throw new tools.ArgumentError('Must provide a valid rta');
  }

  if (typeof options.rta !== 'string' || options.rta.length === 0) {
    throw new tools.ArgumentError('The provided rta is invalid: ' + options.rta);
  }

  if (options.domain === null || options.domain === undefined) {
    throw new tools.ArgumentError('Must provide a valid domain');
  }

  if (typeof options.domain !== 'string' || options.domain.length === 0) {
    throw new tools.ArgumentError('The provided domain is invalid: ' + options.domain);
  }

  if (options.baseUrl === null || options.baseUrl === undefined) {
    throw new tools.ArgumentError('Must provide a valid base URL');
  }

  if (typeof options.baseUrl !== 'string' || options.baseUrl.length === 0) {
    throw new tools.ArgumentError('The provided base URL is invalid: ' + options.baseUrl);
  }

  if (options.clientName === null || options.clientName === undefined) {
    throw new tools.ArgumentError('Must provide a valid client name');
  }

  if (typeof options.clientName !== 'string' || options.clientName.length === 0) {
    throw new tools.ArgumentError('The provided client name is invalid: ' + options.clientName);
  }

  const stateKey = options.stateKey || 'state';
  const nonceKey = options.nonceKey || 'nonce';
  const urlPrefix = options.urlPrefix || '';
  const sessionStorageKey = options.sessionStorageKey || 'apiToken';

  const router = express.Router();
  router.get(urlPrefix + '/login', function(req, res) {
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    res.cookie(stateKey, state);
    res.cookie(nonceKey, nonce);

    const sessionManager = new tools.SessionManager(options.rta, options.domain, options.baseUrl);
    const redirectTo = sessionManager.createAuthorizeUrl({
      redirectUri: urlHelpers.getBaseUrl(req) + urlPrefix + '/login/callback',
      scopes: options.scopes,
      expiration: options.expiration,
      nonce: nonce
    });
    res.redirect(redirectTo + '&state=' + state);
  });

  router.post(urlPrefix + '/login/callback', cookieParser(), function(req, res, next) {
    var decoded;

    try {
      decoded = jwt.decode(req.body.id_token);
    } catch (e) {
      decoded = null;
    }

    if (!decoded || !req.cookies || req.cookies[nonceKey] !== decoded.nonce) {
      return next(new tools.ValidationError('Login failed. Nonce mismatch.'));
    }

    if (!req.cookies || req.cookies[stateKey] !== req.body.state) {
      return next(new tools.ValidationError('Login failed. State mismatch.'));
    }

    const sessionManager = new tools.SessionManager(options.rta, options.domain, options.baseUrl);
    const session = sessionManager.create(req.body.id_token, req.body.access_token, {
      secret: options.secret,
      issuer: options.baseUrl,
      audience: options.audience
    });

    return session
      .then(function(token) {
        res.header('Content-Type', 'text/html');
        res.status(200).send('<html>' +
          '<head>' +
          '<script type="text/javascript">' +
          'sessionStorage.setItem("' + sessionStorageKey + '", "' + token + '");' +
          'window.location.href = "' + urlHelpers.getBaseUrl(req) + '";' +
          '</script>' +
          '</head>' +
          '</html>');
      })
      .catch(function(err) {
        next(err);
      });
  });

  router.get(urlPrefix + '/logout', function(req, res) {
    const encodedBaseUrl = encodeURIComponent(urlHelpers.getBaseUrl(req));
    res.header('Content-Type', 'text/html');
    res.status(200).send(
      '<html>' +
      '<head>' +
      '<script type="text/javascript">' +
      'sessionStorage.removeItem("' + sessionStorageKey + '");' +
      'window.location.href = "https://' + options.rta + '/v2/logout/?returnTo=' + encodedBaseUrl + '&client_id=' + encodedBaseUrl + '";' +
      '</script>' +
      '</head>' +
      '</html>'
    );
  });

  router.get('/.well-known/oauth2-client-configuration', function(req, res) {
    res.header('Content-Type', 'application/json');
    res.status(200).send({
      redirect_uris: [ urlHelpers.getBaseUrl(req) + urlPrefix + '/login/callback' ],
      client_name: options.clientName,
      post_logout_redirect_uris: [ urlHelpers.getBaseUrl(req) ]
    });
  });

  return router;
};
