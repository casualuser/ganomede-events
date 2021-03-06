// unit tests for events.middleware.post

'use strict';

const td = require('testdouble');
const restify = require('restify');

const {anything, isA} = td.matchers;
const {verify, when} = td;
const calledOnce = {times: 1, ignoreExtraArgs: true};

describe('events.middleware.post', () => {

  let poll;
  let store;
  let middleware;
  let log;
  let req;
  let res;
  let next;

  const FAILING_ADD_CHANNEL = 'failing-add-channel';
  const FAILING_EMIT_CHANNEL = 'failing-emit-channel';
  const SUCCESS_CHANNEL = 'success-channel';
  const SUCCESS_EVENT = {
    from: 'from',
    type: 'type',
    data: {a: 1, b: 2}
  };
  const SUCCESS_ID = 3;
  const SUCCESS_EVENT_WITH_ID = Object.assign(
    {id: SUCCESS_ID}, SUCCESS_EVENT);

  const testChannels = {};

  // FAILING_ADD_CHANNEL:
  //  - addEvent fails with a InternalServerError
  testChannels[FAILING_ADD_CHANNEL] = () => {
    when(store.addEvent(FAILING_ADD_CHANNEL, anything()))
      .thenCallback(new restify.InternalServerError());
  };

  // SUCCESS_CHANNEL:
  //  - addEvent and emit succeeds
  testChannels[SUCCESS_CHANNEL] = () => {
    when(store.addEvent(SUCCESS_CHANNEL, SUCCESS_EVENT))
      .thenCallback(null, SUCCESS_EVENT_WITH_ID);
    td.when(poll.emit(SUCCESS_CHANNEL, anything()))
      .thenCallback(null);
  };

  // FAILING_EMIT_CHANNEL:
  //  - addEvent succeeds
  //  - emit fails with a InternalServerError
  testChannels[FAILING_EMIT_CHANNEL] = () => {
    when(store.addEvent(FAILING_EMIT_CHANNEL, SUCCESS_EVENT))
      .thenCallback(null, SUCCESS_EVENT_WITH_ID);
    td.when(poll.emit(FAILING_EMIT_CHANNEL, anything()))
      .thenCallback(new restify.InternalServerError());
  };

  beforeEach(() => {

    store = td.object(['addEvent']);
    when(store.addEvent(anything(), anything()))
      .thenCallback(new Error('unexpected store.addEvent'));

    poll = td.object(require('../src/poll.js').createPoll({}));
    when(poll.emit(anything(), anything()))
      .thenCallback(new Error('unexpected poll.emit'));

    log = td.object(['error', 'info']);

    middleware = require('../src/events.middleware.post')
      .createMiddleware({poll, store, log});

    const input = validInput();
    req = input.req;
    res = input.res;
    next = input.next;
  });

  const validRequest = () => ({
    body: Object.assign({}, SUCCESS_EVENT)
  });

  const validInput = () => ({
    req: validRequest(),
    res: td.object(['json']),
    next: td.function('next')
  });

  const withChannel = (channel) => {
    if (testChannels[channel])
      testChannels[channel]();
    req.body.channel = channel;
    middleware(req, res, next);
  };

  it('fails when channel parameter is undefined', () => {
    withChannel(undefined);
    verify(next(), calledOnce);
    verify(next(isA(restify.InvalidContentError)));
  });

  it('fails when store.addEvent fails', () => {
    withChannel(FAILING_ADD_CHANNEL);
    verify(next(), calledOnce);
    verify(next(isA(restify.InternalServerError)));
  });

  it('logs poll.emit failures to the console', () => {
    withChannel(FAILING_EMIT_CHANNEL);
    verify(next(), calledOnce);
    verify(log.error(), {ignoreExtraArgs: true});
  });

  it('responds with the added event', () => {
    withChannel(SUCCESS_CHANNEL);
    verify(next(), calledOnce);
    verify(next());
    verify(res.json(SUCCESS_EVENT_WITH_ID));
    verify(log.error(), {times: 0, ignoreExtraArgs: true});
  });

});
// vim: ts=2 sw=2 et

