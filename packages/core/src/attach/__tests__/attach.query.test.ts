import { allSettled, createStore, fork } from 'effector';
import { describe, test, expect, vi } from 'vitest';
import { unknownContract } from '../../contract/unknown_contract';
import { fetchFx } from '../../fetch/fetch';
import { createJsonQuery } from '../../query/create_json_query';

import { createQuery } from '../../query/create_query';
import { attachOperation } from '../attach';

describe('attach for query', () => {
  test('execute original handler as handler', async () => {
    const originalHandler = vi
      .fn()
      .mockResolvedValue('data from original query');

    const originalQuery = createQuery({ handler: originalHandler });
    const attachedQuery = attachOperation(originalQuery);

    const scope = fork();

    await allSettled(attachedQuery.start, { scope });

    expect(originalHandler).toBeCalledTimes(1);
    expect(scope.getState(attachedQuery.$data)).toBe(
      'data from original query'
    );
    expect(scope.getState(originalQuery.$data)).toBe(
      'data from original query'
    );
  });

  test('attached queries do not overlap', async () => {
    const originalHandler = vi
      .fn()
      .mockResolvedValueOnce('first response')
      .mockResolvedValueOnce('second response');

    const originalQuery = createQuery({ handler: originalHandler });

    const firstQuery = attachOperation(originalQuery);
    const secondQuery = attachOperation(originalQuery);

    const scope = fork();

    await allSettled(firstQuery.start, { scope });
    await allSettled(secondQuery.start, { scope });

    expect(scope.getState(firstQuery.$data)).toBe('first response');
    expect(scope.getState(secondQuery.$data)).toBe('second response');
  });

  test('attached queries do not overlap with error', async () => {
    const err1 = new Error('cannot');
    const err2 = new Error('can not');

    const originalHandler = vi
      .fn()
      .mockResolvedValueOnce('first response')
      .mockImplementationOnce(() => {
        throw err1;
      })
      .mockImplementationOnce(() => {
        throw err2;
      });

    const originalQuery = createQuery({ handler: originalHandler });

    const firstQuery = attachOperation(originalQuery);
    const secondQuery = attachOperation(originalQuery);
    const thirdQuery = attachOperation(originalQuery);

    const scope = fork();

    await allSettled(firstQuery.start, { scope });
    await allSettled(secondQuery.start, { scope });
    await allSettled(thirdQuery.start, { scope });

    expect(scope.getState(firstQuery.$data)).toBe('first response');
    expect(scope.getState(firstQuery.$error)).toBe(null);
    expect(scope.getState(firstQuery.$failed)).toBe(false);

    expect(scope.getState(secondQuery.$error)).toBe(err1);
    expect(scope.getState(secondQuery.$data)).toBe(null);
    expect(scope.getState(secondQuery.$failed)).toBe(true);

    expect(scope.getState(thirdQuery.$error)).toBe(err2);
    expect(scope.getState(thirdQuery.$data)).toBe(null);
    expect(scope.getState(thirdQuery.$failed)).toBe(true);
  });

  test('pass params from mapParams to original handler', async () => {
    const originalHandler = vi
      .fn()
      .mockResolvedValue('data from original query');

    const originalQuery = createQuery({ handler: originalHandler });
    const attachedQuery = attachOperation(originalQuery, {
      mapParams: (v: number) => v * 2,
    });

    const scope = fork();

    await allSettled(attachedQuery.start, { scope, params: 1 });
    await allSettled(attachedQuery.start, { scope, params: 2 });

    expect(originalHandler).toBeCalledTimes(2);

    expect(originalHandler).toBeCalledWith(2);
    expect(originalHandler).toBeCalledWith(4);
  });

  test('uses source as second arguments in mapParams', async () => {
    const originalHandler = vi
      .fn()
      .mockResolvedValue('data from original query');

    const $source = createStore(1);

    const originalQuery = createQuery({ handler: originalHandler });
    const attachedQuery = attachOperation(originalQuery, {
      source: $source,
      mapParams: (v: number, s) => s,
    });

    const scope = fork();

    await allSettled($source, { scope, params: 11 });
    await allSettled(attachedQuery.start, { scope, params: 1 });

    await allSettled($source, { scope, params: 55 });
    await allSettled(attachedQuery.start, { scope, params: 2 });

    expect(originalHandler).toBeCalledTimes(2);

    expect(originalHandler).toBeCalledWith(11);
    expect(originalHandler).toBeCalledWith(55);
  });

  test('supports special factories', async () => {
    const originalQuery = createJsonQuery({
      request: { method: 'GET', url: 'https://api.salo.com' },
      response: { contract: unknownContract },
    });

    const attachedQuery = attachOperation(originalQuery);

    const fetchMock = vi.fn().mockRejectedValue(new Error('cannot'));

    const scope = fork({ handlers: [[fetchFx, fetchMock]] });

    await allSettled(attachedQuery.start, { scope });

    expect(fetchMock).toBeCalledTimes(1);
    expect(await fetchMock.mock.calls[0][0].url).toBe('https://api.salo.com/');
  });
});
