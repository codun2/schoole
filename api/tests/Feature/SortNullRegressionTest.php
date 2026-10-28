<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesTenant;
use Tests\TestCase;

/** Regression for the production bug: an empty "order" box posted null into a NOT NULL `sort` column (5 logged failures). */
class SortNullRegressionTest extends TestCase
{
    use RefreshDatabase, CreatesTenant;

    public function test_subject_and_inventory_category_accept_empty_sort(): void
    {
        $t = $this->makeTenant();
        $h = $this->auth($t['token']);

        $this->postJson('/api/app/subjects', ['name_ar' => 'الرياضيات', 'sort' => null, 'max_mark' => 100, 'pass_mark' => 50], $h)
            ->assertStatus(201)->assertJsonPath('sort', 0);

        $this->postJson('/api/app/inventory-categories', ['name' => 'أثاث', 'sort' => null], $h)
            ->assertStatus(201)->assertJsonPath('sort', 0);

        // and a real value is still honoured
        $this->postJson('/api/app/subjects', ['name_ar' => 'العلوم', 'sort' => 7, 'max_mark' => 100, 'pass_mark' => 50], $h)
            ->assertStatus(201)->assertJsonPath('sort', 7);
    }
}
