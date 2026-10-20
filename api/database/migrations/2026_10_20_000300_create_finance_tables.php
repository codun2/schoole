<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Finance: fee items, student contracts, installments, payments + accounting (cash accounts, vouchers, invoices, expenses). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fee_items', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->unsignedBigInteger('grade_id')->nullable(); // null = all grades
            $t->string('name');
            $t->string('type', 20)->default('tuition'); // tuition | registration | books | uniform | bus | activity | other
            $t->decimal('amount', 12, 3)->default(0);
            $t->boolean('is_mandatory')->default(true);
            $t->boolean('taxable')->default(false);
            $t->timestamps();
        });

        Schema::create('contracts', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('academic_year_id')->index();
            $t->string('number')->index();
            $t->unsignedBigInteger('student_id')->index();
            $t->unsignedBigInteger('guardian_id')->nullable()->index();
            $t->unsignedBigInteger('grade_id')->nullable();
            $t->unsignedBigInteger('section_id')->nullable();
            $t->unsignedBigInteger('bus_id')->nullable();
            $t->date('date');
            $t->decimal('subtotal', 12, 3)->default(0);
            $t->string('discount_type', 10)->default('fixed'); // fixed | percent
            $t->decimal('discount_value', 12, 3)->default(0);
            $t->decimal('discount', 12, 3)->default(0);
            $t->string('discount_reason')->nullable();
            $t->decimal('tax_rate', 5, 2)->default(0);
            $t->decimal('tax', 12, 3)->default(0);
            $t->decimal('total', 12, 3)->default(0);
            $t->decimal('paid', 12, 3)->default(0);
            $t->decimal('remaining', 12, 3)->default(0);
            $t->string('status', 20)->default('draft'); // draft | active | completed | cancelled
            $t->unsignedInteger('installments_count')->default(1);
            $t->date('first_due_date')->nullable();
            $t->text('notes')->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamps();
        });

        Schema::create('contract_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('contract_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('fee_item_id')->nullable();
            $t->string('name');
            $t->decimal('amount', 12, 3)->default(0);
            $t->timestamps();
        });

        Schema::create('installments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->foreignId('contract_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('student_id')->index();
            $t->unsignedInteger('seq')->default(1);
            $t->date('due_date')->index();
            $t->decimal('amount', 12, 3)->default(0);
            $t->decimal('paid', 12, 3)->default(0);
            $t->string('status', 12)->default('pending'); // pending | partial | paid
            $t->timestamps();
        });

        Schema::create('cash_accounts', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->string('type', 10)->default('cash'); // cash | bank
            $t->string('bank_name')->nullable();
            $t->string('account_no')->nullable();
            $t->string('iban')->nullable();
            $t->decimal('opening_balance', 14, 3)->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        // Unified money movement ledger. Receipt = money in, payment = money out.
        Schema::create('vouchers', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('type', 10)->index(); // receipt | payment
            $t->string('number')->index();
            $t->date('date')->index();
            $t->decimal('amount', 14, 3);
            $t->unsignedBigInteger('cash_account_id')->nullable()->index();
            $t->string('method', 12)->default('cash'); // cash | bank | card | cheque
            $t->string('reference')->nullable();
            $t->string('category', 20)->default('other'); // tuition | service | expense | salary | advance | purchase | other
            $t->string('party_type', 20)->nullable(); // guardian | customer | supplier | employee | other
            $t->unsignedBigInteger('party_id')->nullable();
            $t->string('party_name')->nullable();
            $t->string('source_type', 30)->nullable(); // contract | service_invoice | expense | payroll | advance
            $t->unsignedBigInteger('source_id')->nullable();
            $t->unsignedBigInteger('installment_id')->nullable();
            $t->string('description')->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamps();
            $t->index(['source_type', 'source_id']);
        });

        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->string('phone')->nullable();
            $t->string('email')->nullable();
            $t->string('tax_number')->nullable();
            $t->string('address')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('suppliers', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->string('contact_person')->nullable();
            $t->string('phone')->nullable();
            $t->string('email')->nullable();
            $t->string('tax_number')->nullable();
            $t->string('address')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('service_invoices', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('number')->index();
            $t->unsignedBigInteger('customer_id')->nullable()->index();
            $t->string('customer_name')->nullable();
            $t->date('date');
            $t->date('due_date')->nullable();
            $t->decimal('subtotal', 12, 3)->default(0);
            $t->decimal('discount', 12, 3)->default(0);
            $t->decimal('tax_rate', 5, 2)->default(0);
            $t->decimal('tax', 12, 3)->default(0);
            $t->decimal('total', 12, 3)->default(0);
            $t->decimal('paid', 12, 3)->default(0);
            $t->string('status', 12)->default('issued'); // draft | issued | partial | paid | cancelled
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('service_invoice_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('service_invoice_id')->constrained()->cascadeOnDelete();
            $t->string('description');
            $t->decimal('qty', 10, 2)->default(1);
            $t->decimal('price', 12, 3)->default(0);
            $t->decimal('total', 12, 3)->default(0);
            $t->timestamps();
        });

        Schema::create('expense_categories', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->string('color', 10)->default('#6366f1');
            $t->timestamps();
        });

        Schema::create('expenses', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('number')->index();
            $t->unsignedBigInteger('expense_category_id')->nullable()->index();
            $t->unsignedBigInteger('supplier_id')->nullable()->index();
            $t->unsignedBigInteger('branch_id')->nullable();
            $t->date('date')->index();
            $t->string('description');
            $t->decimal('amount', 12, 3)->default(0);
            $t->decimal('tax', 12, 3)->default(0);
            $t->decimal('total', 12, 3)->default(0);
            $t->decimal('paid', 12, 3)->default(0);
            $t->string('status', 12)->default('unpaid'); // unpaid | partial | paid
            $t->string('attachment')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['expenses', 'expense_categories', 'service_invoice_items', 'service_invoices', 'suppliers', 'customers', 'vouchers', 'cash_accounts', 'installments', 'contract_items', 'contracts', 'fee_items'] as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }
};
