import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PersistentNodeCache } from "../src/persistentNodeCache";
const fs = require('fs');
const { Readable } = require('stream');
import {EventEmitter} from 'events';

describe("persistentNodeCache", () => {
    beforeEach(() => {
        jest.mock('fs');
    });

    it('should set the key-value', () => {
        fs.appendFileSync = jest.fn();
        let cache = new PersistentNodeCache("mycache", 2000);
        cache.set("foo", "bar");
        let val = cache.get("foo")
        expect(val).toBe("bar");
        expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
        let item = { cmd: 'set', key: 'foo', val: 'bar'};
        expect(fs.appendFileSync).toBeCalledWith('/Users/rahulsharma/mycache.append', Buffer.from(JSON.stringify(item) + '\n'))
        cache.close();
    });

    it('should multi set the key-value pairs', () => {
        fs.appendFileSync = jest.fn();
        let cache = new PersistentNodeCache("mycache", 1000);
        cache.mset([{key: 'foo', val: 'bar'}, {key: 'alice', val: 'bob'}]);
        let val = cache.get("foo");
        expect(val).toBe('bar');
        val = cache.get('alice');
        expect(val).toBe('bob');
        let item = { cmd: 'mset', keyValue: [{key: 'foo', val: 'bar'}, {key: 'alice', val: 'bob'}]};
        expect(fs.appendFileSync).toBeCalledWith('/Users/rahulsharma/mycache.append', Buffer.from(JSON.stringify(item) + '\n'))
        cache.close();
    });

    it('should take a key-value pair', () => {
        fs.appendFileSync = jest.fn();
        let cache = new PersistentNodeCache("mycache", 1000);
        cache.mset([{key: 'foo', val: 'bar'}, {key: 'alice', val: 'bob'}]);
        let val = cache.take('foo');
        expect(val).toBe('bar');
        val = cache.get('foo');
        expect(val).toBe(undefined);
        let item = { cmd: 'del', key: 'foo'};
        expect(fs.appendFileSync).toBeCalledWith('/Users/rahulsharma/mycache.append', Buffer.from(JSON.stringify(item) + '\n'))
        cache.close();
    });

    it('should delete a key-value pair', () => {
        fs.appendFileSync = jest.fn();
        let cache = new PersistentNodeCache("mycache", 1000);
        cache.mset([{key: 'foo', val: 'bar'}, {key: 'alice', val: 'bob'}]);
        let val = cache.get("foo");
        expect(val).toBe('bar');
        cache.del('foo');
        val = cache.get("foo");
        expect(val).toBe(undefined);
        let item = { cmd: 'del', key: 'foo'};
        expect(fs.appendFileSync).toBeCalledWith('/Users/rahulsharma/mycache.append', Buffer.from(JSON.stringify(item) + '\n'))
        cache.close();
    });

    it('should expire key-value pair', async () => {
        fs.appendFileSync = jest.fn();
        let cache = new PersistentNodeCache("mycache", 1000);
        cache.set("foo", "bar", 1);
        let val = cache.get("foo");
        expect(val).toBe('bar');
        await new Promise(f => setTimeout(f, 1100));
        val = cache.get("foo");
        expect(val).toBe(undefined);
        let item = { cmd: 'set', key: 'foo', val: 'bar', ttl: 1};
        expect(fs.appendFileSync).toBeCalledWith('/Users/rahulsharma/mycache.append', Buffer.from(JSON.stringify(item) + '\n'))
        cache.close();
    });

    it('should expire key-value pair with ttl command', async () => {
        fs.appendFileSync = jest.fn();
        let cache = new PersistentNodeCache("mycache", 1000);
        cache.set("foo", "bar");
        let val = cache.get("foo");
        expect(val).toBe('bar');
        cache.ttl('foo', 1);
        await new Promise(f => setTimeout(f, 1100));
        val = cache.get("foo");
        expect(val).toBe(undefined);
        let item = { cmd: 'ttl', key: 'foo', ttl: 1};
        expect(fs.appendFileSync).toBeCalledWith('/Users/rahulsharma/mycache.append', Buffer.from(JSON.stringify(item) + '\n'))
        cache.close();
    });
});

describe("persistentNodeCacheBackupRestore", () => {
    beforeEach(() => {
        jest.mock('fs');
    });

    it("should save backup periodically", () => {
        fs.writeFileSync = jest.fn();
        jest.useFakeTimers();
        let cache = new PersistentNodeCache("mycache", 1000, '/tmp');
        cache.mset([{key: 'foo', val: 'bar'}, {key: 'alice', val: 'bob'}]);
        jest.advanceTimersByTime(1500);
        let data = [{key: 'foo', val: 'bar', ttl: 0}, {key: 'alice', val: 'bob', ttl: 0}]
        expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/mycache.backup', Buffer.from(JSON.stringify(data)));
        expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/mycache.append', '');
        cache.close();
    });

    it("should restore cache from backup", async () => {
        let data = [{key: 'foo', val: 'bar', ttl: 0}, {key: 'alice', val: 'bob', ttl: 0}]
        jest.spyOn(fs, 'readFileSync').mockImplementation(function () {
            return Buffer.from(JSON.stringify(data));
        });
        let cmd1 = { cmd: 'set', key: 'john', val: 'doe'}
        let cmd2 = { cmd: 'del', key: 'alice'}
        let cmd3 = { cmd: 'mset', keyValue: [{key: 'abc', val: 'xyz'}, {key: 'cat', val: 'dog', ttl: 10}]}
        let buffer = Buffer.from(JSON.stringify(cmd1) + '\n' + JSON.stringify(cmd2) + '\n' + JSON.stringify(cmd3) + '\n');
        jest.spyOn(fs, 'createReadStream').mockImplementation(function () {
            return Readable.from(buffer);
        });
        let cache = new PersistentNodeCache("mycache", 1000);
        await cache.recover();
        let val = cache.get('foo');
        expect(val).toBe('bar');
        val = cache.get('nothing');
        expect(val).toBe(undefined);
        val = cache.get('alice');
        expect(val).toBe(undefined);
        val = cache.get('abc');
        expect(val).toBe('xyz');
        var d = new Date();
        let ttl = cache.getTtl('cat')
        expect(ttl).toBeDefined();
        expect(d.getTime() - Number(ttl)).toBeLessThanOrEqual(10);
        cache.close();
    });
});

describe('persistentNodeCacheTestWait', () => {
    it('should wait for the event for set', () => {
        let emitter = new EventEmitter();
        let cache = new PersistentNodeCache("mycache", 1000);
        Reflect.set(cache, 'emitter', emitter);
        Reflect.set(cache, 'flushingToDisk', true);
        cache.set('foo', 'bar');
        let val = cache.get('foo');
        expect(val).toBe(undefined);
        Reflect.set(cache, 'flushingToDisk', false);
        emitter.emit('done');
        setTimeout(() => {
            val = cache.get('foo');
            expect(val).toBe('bar');
            cache.close();
        }, 10);
    });

    it('should wait for the event for del', async () => {
        let emitter = new EventEmitter();
        let cache = new PersistentNodeCache("mycache", 1000);
        Reflect.set(cache, 'emitter', emitter);
        cache.set('foo', 'bar');
        let val = cache.get('foo')
        expect(val).toBe('bar');
        Reflect.set(cache, 'flushingToDisk', true);
        cache.del('foo');
        val = cache.get('foo')
        expect(val).toBe('bar');
        Reflect.set(cache, 'flushingToDisk', false);
        emitter.emit('done');
        setTimeout(() => {
            val = cache.get('foo');
            expect(val).toBe(undefined);
            cache.close();
        }, 10);
    });

    it('should wait for the event for set', () => {
        let emitter = new EventEmitter();
        let cache = new PersistentNodeCache("mycache", 1000);
        Reflect.set(cache, 'emitter', emitter);
        Reflect.set(cache, 'flushingToDisk', true);
        cache.mset([{key: 'foo', val: 'bar'}, {key: 'alice', val: 'bob'}]);
        let val = cache.get('alice');
        expect(val).toBe(undefined);
        val = cache.get('foo');
        expect(val).toBe(undefined);
        Reflect.set(cache, 'flushingToDisk', false);
        emitter.emit('done');
        setTimeout(() => {
            val = cache.get('foo');
            expect(val).toBe('bar');
            val = cache.get('alice')
            expect(val).toBe('bob');
            cache.close();
        }, 10);
    });
});