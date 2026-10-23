# Summary consumer fixtures

`mock-worker-producer.py` creates immutable versions by invoking the actual
private summary worker with local mocked evidence and a deterministic inference
callback. It writes only into the temporary directory supplied by its test.
The mock uses the worker's `official_download` validation branch to exercise the
public producer contract; it is test data, never production evidence. No provider
or network request is made.
