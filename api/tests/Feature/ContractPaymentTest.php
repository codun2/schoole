<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesTenant;
use Tests\TestCase;

/** The money path: contract → installments → payment → receipt voucher (bilingual) → ledger views. */
class ContractPaymentTest extends TestCase
{
    use RefreshDatabase, CreatesTenant;

    public function test_contract_payment_creates_voucher_and_updates_balances(): void
    {
        $t = $this->makeTenant();
        $h = $this->auth($t['token']);

        $guardian = $this->postJson('/api/app/guardians', ['name' => 'سالم الرحبي', 'name_en' => 'Salim Al-Rahbi', 'phone' => '96890000002'], $h)->assertStatus(201)->json();
        $student = $this->postJson('/api/app/students', ['name' => 'ريم', 'name_en' => 'Reem', 'guardian_id' => $guardian['id'], 'grade_id' => $t['grade']->id, 'section_id' => $t['section']->id], $h)->assertStatus(201)->json();

        $contract = $this->postJson('/api/app/contracts', [
            'student_id' => $student['id'], 'date' => '2026-09-01',
            'items' => [['name' => 'رسوم دراسية', 'amount' => 1000]],
            'installments_count' => 4, 'first_due_date' => '2026-09-01',
        ], $h)->assertStatus(201)->json();
        $this->assertEquals(1000, (float) $contract['total']);
        $this->assertEquals(1000, (float) $contract['remaining']);
        $this->assertCount(4, $contract['installments'] ?? $this->getJson('/api/app/contracts/'.$contract['id'], $h)->json('installments'));

        // business rule: payments are only accepted on an activated contract (new ones are drafts)
        $this->postJson('/api/app/contracts/'.$contract['id'].'/payments', ['amount' => 1, 'method' => 'cash', 'date' => '2026-09-05'], $h)->assertStatus(422);
        $this->postJson('/api/app/contracts/'.$contract['id'].'/activate', [], $h)->assertOk();

        $pay = $this->postJson('/api/app/contracts/'.$contract['id'].'/payments', ['amount' => 250, 'method' => 'cash', 'date' => '2026-09-05'], $h)->assertStatus(201)->json();
        $voucher = $pay['voucher'];
        $this->assertSame('receipt', $voucher['type']);
        $this->assertStringStartsWith('RC-', $voucher['number']);
        $this->assertEquals(250, (float) $voucher['amount']);
        // bilingual, generated at creation (not a dictionary lookup)
        $this->assertStringContainsString('Tuition payment — Reem', $voucher['description_en']);
        $this->assertSame('Salim Al-Rahbi', $voucher['party_name_en']);

        $fresh = $this->getJson('/api/app/contracts/'.$contract['id'], $h)->assertOk()->json();
        $this->assertEquals(250, (float) $fresh['paid']);
        $this->assertEquals(750, (float) $fresh['remaining']);

        // ledger view used by the "installment payments" screen carries the English names
        $row = collect($this->getJson('/api/app/tuition-payments', $h)->assertOk()->json('data'))->firstWhere('number', $voucher['number']);
        $this->assertSame('Reem', $row['student_name_en']);
        $this->assertSame('Salim Al-Rahbi', $row['party_name_en']);
    }
}
