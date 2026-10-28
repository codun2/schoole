<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesTenant;
use Tests\TestCase;

class StudentCrudTest extends TestCase
{
    use RefreshDatabase, CreatesTenant;

    public function test_full_student_lifecycle_with_bilingual_name(): void
    {
        $t = $this->makeTenant();
        $h = $this->auth($t['token']);

        $created = $this->postJson('/api/app/students', [
            'name' => 'جود بنت ناصر', 'name_en' => 'Jood bint Nasser', 'gender' => 'female',
            'grade_id' => $t['grade']->id, 'section_id' => $t['section']->id,
        ], $h)->assertStatus(201)->json();
        $this->assertNotEmpty($created['student_no'], 'student_no must be generated');
        $this->assertSame('Jood bint Nasser', $created['name_en']);

        // list returns it with English names on the relations (what the UI uses for S.enName/S.gs)
        $row = collect($this->getJson('/api/app/students?year=all', $h)->assertOk()->json('data'))->firstWhere('id', $created['id']);
        $this->assertSame('Grade 1', $row['grade']['name_en']);
        $this->assertSame('Section A', $row['section']['name_en']);

        $this->patchJson('/api/app/students/'.$created['id'], ['name_en' => 'Jood N. Al-Harthi'], $h)->assertOk();
        $this->assertSame('Jood N. Al-Harthi', $this->getJson('/api/app/students/'.$created['id'], $h)->json('name_en'));

        $this->deleteJson('/api/app/students/'.$created['id'], [], $h)->assertOk();
        $this->getJson('/api/app/students/'.$created['id'], $h)->assertStatus(404);
    }

    public function test_validation_rejects_missing_name(): void
    {
        $t = $this->makeTenant();
        $this->postJson('/api/app/students', ['gender' => 'male'], $this->auth($t['token']))
            ->assertStatus(422)->assertJsonValidationErrors(['name']);
    }
}
