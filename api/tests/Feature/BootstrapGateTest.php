<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Gate test: do all migrations run on the in-memory SQLite test DB, and does login work end-to-end? */
class BootstrapGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_migrations_run_and_login_works(): void
    {
        $this->assertSame('sqlite', config('database.default'), 'tests must never run against the production MySQL');

        $co = Company::create(['name' => 'مدرسة الاختبار', 'slug' => 'test-school', 'status' => 'active', 'currency' => 'SAR']);
        $u = new User(['name' => 'Admin', 'email' => 'admin@test.local', 'role' => 'admin', 'status' => 'active', 'password' => 'secret123']);
        $u->company_id = $co->id;
        $u->save();

        $this->postJson('/api/auth/login', ['login' => 'admin@test.local', 'password' => 'secret123'])
            ->assertOk()
            ->assertJsonPath('home', '/app/')
            ->assertJsonStructure(['token', 'user' => ['id', 'name', 'name_en'], 'company', 'dict']);

        $this->postJson('/api/auth/login', ['login' => 'admin@test.local', 'password' => 'wrong'])
            ->assertStatus(422);
    }
}
