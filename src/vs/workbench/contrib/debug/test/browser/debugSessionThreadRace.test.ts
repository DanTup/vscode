/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DebugSession } from '../../browser/debugSession.js';
import { DebugModel } from '../../common/debugModel.js';
import { MockDebugStorage } from '../common/mockDebug.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('Debug Session - Thread Race Condition', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let session: DebugSession;
	let model: DebugModel;
	let rawSession: MockRawDebugSession;

	class MockRawDebugSession {
		private _onDidThread = new Emitter<DebugProtocol.ThreadEvent>();
		private _onDidStop = new Emitter<DebugProtocol.StoppedEvent>();
		private _onDidContinue = new Emitter<DebugProtocol.ContinuedEvent>();
		private _onDidInitialize = new Emitter<DebugProtocol.InitializedEvent>();
		private _onDidTerminateDebugee = new Emitter<DebugProtocol.TerminatedEvent>();
		private _onDidExitDebugee = new Emitter<DebugProtocol.ExitedEvent>();
		private _onDidOutput = new Emitter<DebugProtocol.OutputEvent>();
		private _onDidBreakpoint = new Emitter<DebugProtocol.BreakpointEvent>();
		private _onDidLoadedSource = new Emitter<DebugProtocol.LoadedSourceEvent>();
		private _onDidCustomEvent = new Emitter<DebugProtocol.Event>();
		private _onDidProgressStart = new Emitter<DebugProtocol.ProgressStartEvent>();
		private _onDidProgressUpdate = new Emitter<DebugProtocol.ProgressUpdateEvent>();
		private _onDidProgressEnd = new Emitter<DebugProtocol.ProgressEndEvent>();
		private _onDidInvalidated = new Emitter<DebugProtocol.InvalidatedEvent>();
		private _onDidInvalidateMemory = new Emitter<DebugProtocol.MemoryEvent>();
		private _onDidExitAdapter = new Emitter<DebugProtocol.Event>();

		public readonly capabilities: DebugProtocol.Capabilities = {};
		public threadsResponse: DebugProtocol.ThreadsResponse | undefined;
		public threadsDelay = 0;

		get onDidThread(): Event<DebugProtocol.ThreadEvent> { return this._onDidThread.event; }
		get onDidStop(): Event<DebugProtocol.StoppedEvent> { return this._onDidStop.event; }
		get onDidContinued(): Event<DebugProtocol.ContinuedEvent> { return this._onDidContinue.event; }
		get onDidInitialize(): Event<DebugProtocol.InitializedEvent> { return this._onDidInitialize.event; }
		get onDidTerminateDebugee(): Event<DebugProtocol.TerminatedEvent> { return this._onDidTerminateDebugee.event; }
		get onDidExitDebugee(): Event<DebugProtocol.ExitedEvent> { return this._onDidExitDebugee.event; }
		get onDidOutput(): Event<DebugProtocol.OutputEvent> { return this._onDidOutput.event; }
		get onDidBreakpoint(): Event<DebugProtocol.BreakpointEvent> { return this._onDidBreakpoint.event; }
		get onDidLoadedSource(): Event<DebugProtocol.LoadedSourceEvent> { return this._onDidLoadedSource.event; }
		get onDidCustomEvent(): Event<DebugProtocol.Event> { return this._onDidCustomEvent.event; }
		get onDidProgressStart(): Event<DebugProtocol.ProgressStartEvent> { return this._onDidProgressStart.event; }
		get onDidProgressUpdate(): Event<DebugProtocol.ProgressUpdateEvent> { return this._onDidProgressUpdate.event; }
		get onDidProgressEnd(): Event<DebugProtocol.ProgressEndEvent> { return this._onDidProgressEnd.event; }
		get onDidInvalidated(): Event<DebugProtocol.InvalidatedEvent> { return this._onDidInvalidated.event; }
		get onDidInvalidateMemory(): Event<DebugProtocol.MemoryEvent> { return this._onDidInvalidateMemory.event; }
		get onDidExitAdapter(): Event<DebugProtocol.Event> { return this._onDidExitAdapter.event; }

		initialize() { return Promise.resolve({ body: {} }); }
		disconnect() { return Promise.resolve({}); }
		async threads(): Promise<DebugProtocol.ThreadsResponse | undefined> {
			if (this.threadsDelay > 0) {
				await timeout(this.threadsDelay);
			}
			return this.threadsResponse;
		}

		// Simulate events
		fireThreadEvent(reason: 'started' | 'exited', threadId: number) {
			this._onDidThread.fire({
				seq: 0,
				type: 'event',
				event: 'thread',
				body: { reason, threadId }
			});
		}

		fireStoppedEvent(threadId: number, reason = 'entry', allThreadsStopped = false) {
			this._onDidStop.fire({
				seq: 0,
				type: 'event',
				event: 'stopped',
				body: { threadId, reason, allThreadsStopped }
			});
		}

		fireContinuedEvent(threadId: number, allThreadsContinued = false) {
			this._onDidContinue.fire({
				seq: 0,
				type: 'event',
				event: 'continued',
				body: { threadId, allThreadsContinued }
			});
		}

		dispose() {
			this._onDidThread.dispose();
			this._onDidStop.dispose();
			this._onDidContinue.dispose();
			this._onDidInitialize.dispose();
			this._onDidTerminateDebugee.dispose();
			this._onDidExitDebugee.dispose();
			this._onDidOutput.dispose();
			this._onDidBreakpoint.dispose();
			this._onDidLoadedSource.dispose();
			this._onDidCustomEvent.dispose();
			this._onDidProgressStart.dispose();
			this._onDidProgressUpdate.dispose();
			this._onDidProgressEnd.dispose();
			this._onDidInvalidated.dispose();
			this._onDidInvalidateMemory.dispose();
			this._onDidExitAdapter.dispose();
		}
	}

	setup(() => {
		const instantiationService = new TestInstantiationService();

		const storage = disposables.add(new TestStorageService());
		model = disposables.add(new DebugModel(disposables.add(new MockDebugStorage(storage)), <any>{ isDirty: (e: any) => false }, undefined!, new NullLogService()));

		session = disposables.add(instantiationService.createInstance(DebugSession,
			'test-session',
			{ resolved: { type: 'mock', name: 'test', request: 'launch' }, unresolved: undefined },
			undefined,
			model,
			undefined
		));

		rawSession = new MockRawDebugSession();
		disposables.add(rawSession);
		(session as any).initializeForTest(rawSession as any);
	});

	test('thread events followed by immediate stopped and continued events', async () => {
		const threadId = 3;

		// Set up the threads response that will be returned when fetchThreads is called
		rawSession.threadsResponse = {
			seq: 0,
			type: 'response',
			request_seq: 0,
			success: true,
			command: 'threads',
			body: {
				threads: [
					{ id: threadId, name: `Thread ${threadId}` }
				]
			}
		};

		// Fire events in rapid succession like in the bug repro
		rawSession.fireThreadEvent('started', threadId);
		rawSession.fireStoppedEvent(threadId, 'entry', false);
		rawSession.fireContinuedEvent(threadId, false);

		// Wait a bit for all async operations to complete
		await timeout(200);

		// The thread should exist and should not be marked as stopped
		const thread = session.getThread(threadId);
		assert.ok(thread, 'Thread should exist after events');
		assert.strictEqual(thread.stopped, false, 'Thread should not be marked as stopped after continued event');
		assert.strictEqual(thread.stoppedDetails, undefined, 'Thread should not have stopped details after continued event');
	});

	test('continued event for unknown thread waits for fetchThreads', async () => {
		const threadId = 5;

		// Add a delay to threads request to simulate slow response
		rawSession.threadsDelay = 50;

		rawSession.threadsResponse = {
			seq: 0,
			type: 'response',
			request_seq: 0,
			success: true,
			command: 'threads',
			body: {
				threads: [
					{ id: threadId, name: `Thread ${threadId}` }
				]
			}
		};

		// Fire thread started event
		rawSession.fireThreadEvent('started', threadId);

		// Immediately fire continued event before fetchThreads completes
		rawSession.fireContinuedEvent(threadId, false);

		// Wait for all operations to complete
		await timeout(200);

		// The thread should exist
		const thread = session.getThread(threadId);
		assert.ok(thread, 'Thread should exist after fetchThreads completes');
	});

	test('stopped event for unknown thread waits for fetchThreads', async () => {
		const threadId = 7;

		// Add a delay to threads request to simulate slow response
		rawSession.threadsDelay = 50;

		rawSession.threadsResponse = {
			seq: 0,
			type: 'response',
			request_seq: 0,
			success: true,
			command: 'threads',
			body: {
				threads: [
					{ id: threadId, name: `Thread ${threadId}` }
				]
			}
		};

		// Fire thread started event
		rawSession.fireThreadEvent('started', threadId);

		// Immediately fire stopped event before fetchThreads completes
		rawSession.fireStoppedEvent(threadId, 'entry', false);

		// Wait for all operations to complete
		await timeout(200);

		// The thread should exist and be marked as stopped
		const thread = session.getThread(threadId);
		assert.ok(thread, 'Thread should exist after fetchThreads completes');
		assert.strictEqual(thread.stopped, true, 'Thread should be marked as stopped');
		assert.ok(thread.stoppedDetails, 'Thread should have stopped details');
	});

	test('rapid sequence of thread, stopped, continued events', async () => {
		const threadIds = [10, 11, 12];

		rawSession.threadsResponse = {
			seq: 0,
			type: 'response',
			request_seq: 0,
			success: true,
			command: 'threads',
			body: {
				threads: threadIds.map(id => ({ id, name: `Thread ${id}` }))
			}
		};

		// Fire rapid sequence of events for multiple threads
		for (const threadId of threadIds) {
			rawSession.fireThreadEvent('started', threadId);
			rawSession.fireStoppedEvent(threadId, 'entry', false);
			rawSession.fireContinuedEvent(threadId, false);
		}

		// Wait for all operations to complete
		await timeout(200);

		// All threads should exist and not be marked as stopped
		for (const threadId of threadIds) {
			const thread = session.getThread(threadId);
			assert.ok(thread, `Thread ${threadId} should exist`);
			assert.strictEqual(thread.stopped, false, `Thread ${threadId} should not be marked as stopped`);
			assert.strictEqual(thread.stoppedDetails, undefined, `Thread ${threadId} should not have stopped details`);
		}
	});

	test('continued event for non-existent thread does not crash', async () => {
		const nonExistentThreadId = 999;

		rawSession.threadsResponse = {
			seq: 0,
			type: 'response',
			request_seq: 0,
			success: true,
			command: 'threads',
			body: {
				threads: []
			}
		};

		// Fire continued event for thread that doesn't exist
		rawSession.fireContinuedEvent(nonExistentThreadId, false);

		// Wait for all operations to complete
		await timeout(200);

		// Should not crash and thread should not exist
		const thread = session.getThread(nonExistentThreadId);
		assert.strictEqual(thread, undefined, 'Non-existent thread should remain undefined');
	});
});
