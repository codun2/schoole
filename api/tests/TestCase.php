<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Hard safety guard: this suite runs on the production host (the API container is bind-mounted to
     * /opt/schoole, and compose injects DB_CONNECTION=mysql). RefreshDatabase would `migrate:fresh` whatever
     * connection is active, so refuse to boot unless the environment resolves to the in-memory SQLite DB.
     * phpunit.xml pins these with force="true"; this catches any way of running tests that bypasses it.
     */
    protected function setUp(): void
    {
        $conn = getenv('DB_CONNECTION');
        $db = getenv('DB_DATABASE');
        if ($conn !== 'sqlite' || $db !== ':memory:') {
            throw new \RuntimeException("REFUSING TO RUN TESTS: DB_CONNECTION={$conn} DB_DATABASE={$db} — must be sqlite/:memory: (never the production MySQL). Run via `php artisan test` so phpunit.xml forces the env.");
        }

        parent::setUp();

        // belt and braces: verify after boot too
        $d = config('database.default');
        $sdb = config('database.connections.sqlite.database');
        if ($d !== 'sqlite' || $sdb !== ':memory:') {
            throw new \RuntimeException("REFUSING TO RUN TESTS: booted app default={$d} sqlite.database=".var_export($sdb, true).' (expected sqlite / :memory:)');
        }
    }
}
