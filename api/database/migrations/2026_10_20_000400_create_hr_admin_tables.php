<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** HR (employees, attendance, leaves, advances, payroll) + administrative affairs (correspondence, licenses, tasks, archive). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->unsignedBigInteger('manager_id')->nullable();
            $t->timestamps();
        });

        Schema::create('job_titles', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('department_id')->nullable();
            $t->string('name');
            $t->timestamps();
        });

        Schema::create('employees', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('user_id')->nullable();
            $t->string('number')->index();
            $t->string('name');
            $t->string('national_id')->nullable();
            $t->string('nationality')->nullable();
            $t->string('gender', 10)->default('male');
            $t->date('birth_date')->nullable();
            $t->string('phone')->nullable();
            $t->string('email')->nullable();
            $t->unsignedBigInteger('branch_id')->nullable()->index();
            $t->unsignedBigInteger('department_id')->nullable()->index();
            $t->unsignedBigInteger('job_title_id')->nullable()->index();
            $t->boolean('is_teacher')->default(false);
            $t->date('hire_date')->nullable();
            $t->string('status', 20)->default('active'); // active | on_leave | terminated
            $t->decimal('basic_salary', 12, 3)->default(0);
            $t->decimal('housing_allowance', 12, 3)->default(0);
            $t->decimal('transport_allowance', 12, 3)->default(0);
            $t->decimal('other_allowance', 12, 3)->default(0);
            $t->string('bank_name')->nullable();
            $t->string('iban')->nullable();
            $t->string('address')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('employee_attendances', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('employee_id')->index();
            $t->date('date')->index();
            $t->time('check_in')->nullable();
            $t->time('check_out')->nullable();
            $t->string('status', 12)->default('present'); // present | absent | late | leave
            $t->string('note')->nullable();
            $t->timestamps();
            $t->unique(['employee_id', 'date']);
        });

        Schema::create('leave_types', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->unsignedInteger('days_per_year')->default(0);
            $t->boolean('is_paid')->default(true);
            $t->timestamps();
        });

        Schema::create('leave_requests', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('employee_id')->index();
            $t->unsignedBigInteger('leave_type_id')->nullable();
            $t->date('from_date');
            $t->date('to_date');
            $t->unsignedInteger('days')->default(1);
            $t->string('reason')->nullable();
            $t->string('status', 12)->default('pending'); // pending | approved | rejected
            $t->unsignedBigInteger('decided_by')->nullable();
            $t->timestamps();
        });

        Schema::create('employee_advances', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('employee_id')->index();
            $t->date('date');
            $t->decimal('amount', 12, 3);
            $t->decimal('monthly_deduction', 12, 3)->default(0);
            $t->decimal('remaining', 12, 3)->default(0);
            $t->string('status', 12)->default('active'); // active | settled
            $t->string('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('employee_adjustments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('employee_id')->index();
            $t->string('type', 12); // bonus | deduction
            $t->string('title');
            $t->decimal('amount', 12, 3);
            $t->string('month', 7)->index(); // YYYY-MM
            $t->unsignedBigInteger('payroll_id')->nullable();
            $t->string('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('payrolls', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('month', 7); // YYYY-MM
            $t->string('status', 12)->default('draft'); // draft | approved | paid
            $t->unsignedInteger('employees_count')->default(0);
            $t->decimal('total_basic', 14, 3)->default(0);
            $t->decimal('total_allowances', 14, 3)->default(0);
            $t->decimal('total_bonuses', 14, 3)->default(0);
            $t->decimal('total_deductions', 14, 3)->default(0);
            $t->decimal('net_total', 14, 3)->default(0);
            $t->timestamp('approved_at')->nullable();
            $t->timestamp('paid_at')->nullable();
            $t->unsignedBigInteger('voucher_id')->nullable();
            $t->timestamps();
            $t->unique(['company_id', 'month']);
        });

        Schema::create('payroll_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('payroll_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('employee_id')->index();
            $t->decimal('basic', 12, 3)->default(0);
            $t->decimal('allowances', 12, 3)->default(0);
            $t->decimal('bonuses', 12, 3)->default(0);
            $t->decimal('deductions', 12, 3)->default(0);
            $t->decimal('advance_deduction', 12, 3)->default(0);
            $t->decimal('net', 12, 3)->default(0);
            $t->timestamps();
        });

        Schema::create('correspondence_categories', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->timestamps();
        });

        Schema::create('correspondences', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('direction', 12)->default('incoming'); // incoming | outgoing | internal
            $t->string('number')->nullable();
            $t->date('date');
            $t->string('subject');
            $t->string('party')->nullable(); // الجهة المرسلة/المستلمة
            $t->unsignedBigInteger('category_id')->nullable();
            $t->string('priority', 12)->default('normal'); // normal | important | urgent
            $t->string('status', 12)->default('new'); // new | in_progress | closed
            $t->text('body')->nullable();
            $t->string('attachment')->nullable();
            $t->unsignedBigInteger('assigned_to')->nullable();
            $t->timestamps();
        });

        Schema::create('licenses', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->string('number')->nullable();
            $t->string('issuer')->nullable();
            $t->date('issue_date')->nullable();
            $t->date('expiry_date')->nullable()->index();
            $t->decimal('cost', 12, 3)->default(0);
            $t->string('attachment')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('tasks', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('title');
            $t->text('description')->nullable();
            $t->unsignedBigInteger('branch_id')->nullable();
            $t->string('priority', 12)->default('normal'); // normal | important | urgent
            $t->string('status', 12)->default('new'); // new | in_progress | done | cancelled
            $t->unsignedTinyInteger('progress')->default(0);
            $t->date('start_date')->nullable();
            $t->date('end_date')->nullable()->index();
            $t->unsignedBigInteger('assigned_to')->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->string('attachment')->nullable();
            $t->timestamps();
        });

        Schema::create('documents', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('title');
            $t->string('category')->nullable();
            $t->string('file');
            $t->string('mime')->nullable();
            $t->unsignedBigInteger('size')->default(0);
            $t->text('notes')->nullable();
            $t->unsignedBigInteger('uploaded_by')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['documents', 'tasks', 'licenses', 'correspondences', 'correspondence_categories', 'payroll_items', 'payrolls', 'employee_adjustments', 'employee_advances', 'leave_requests', 'leave_types', 'employee_attendances', 'employees', 'job_titles', 'departments'] as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }
};
