<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesTenant;
use Tests\TestCase;

/** The single most important property of a multi-school SaaS: one school can never see or touch another's data. */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase, CreatesTenant;

    public function test_a_school_cannot_read_update_or_delete_another_schools_student(): void
    {
        $a = $this->makeTenant('school-a');
        $b = $this->makeTenant('school-b');

        $student = $this->postJson('/api/app/students', ['name' => 'طالب أ', 'grade_id' => $a['grade']->id, 'section_id' => $a['section']->id], $this->auth($a['token']))
            ->assertStatus(201)->json();

        // B's admin: the record must be invisible (404) or forbidden (403) — never 200
        $this->getJson('/api/app/students/'.$student['id'], $this->auth($b['token']))->assertStatus(404);
        $this->patchJson('/api/app/students/'.$student['id'], ['name' => 'hacked'], $this->auth($b['token']))->assertStatus(404);
        $this->deleteJson('/api/app/students/'.$student['id'], [], $this->auth($b['token']))->assertStatus(404);

        // and B's list is empty while A's contains it
        $this->assertCount(0, $this->getJson('/api/app/students?year=all', $this->auth($b['token']))->assertOk()->json('data'));
        $this->assertCount(1, $this->getJson('/api/app/students?year=all', $this->auth($a['token']))->assertOk()->json('data'));
        $this->assertSame('طالب أ', $this->getJson('/api/app/students/'.$student['id'], $this->auth($a['token']))->assertOk()->json('name'));
    }

    public function test_a_school_cannot_attach_another_schools_section_to_its_student(): void
    {
        $a = $this->makeTenant('school-a');
        $b = $this->makeTenant('school-b');
        // `owned()` rules must reject foreign ids
        $this->postJson('/api/app/students', ['name' => 'x', 'section_id' => $b['section']->id], $this->auth($a['token']))
            ->assertStatus(422);
    }
}
