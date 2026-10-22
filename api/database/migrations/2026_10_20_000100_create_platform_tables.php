<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Platform layer: subscription plans, schools (tenants), branches, notifications, activity log. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('description')->nullable();
            $t->decimal('price_monthly', 12, 3)->default(0);
            $t->decimal('price_yearly', 12, 3)->default(0);
            $t->unsignedInteger('max_students')->default(0); // 0 = unlimited
            $t->unsignedInteger('max_users')->default(0);
            $t->json('features')->nullable();
            $t->boolean('is_active')->default(true);
            $t->unsignedInteger('sort')->default(0);
            $t->timestamps();
        });

        Schema::create('companies', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('name_en')->nullable();
            $t->string('slug')->unique();
            $t->string('status')->default('pending'); // pending | active | suspended
            $t->unsignedBigInteger('plan_id')->nullable();
            $t->timestamp('trial_ends_at')->nullable();
            $t->timestamp('subscription_ends_at')->nullable();
            $t->string('phone')->nullable();
            $t->string('email')->nullable();
            $t->string('city')->nullable();
            $t->string('address')->nullable();
            $t->string('logo')->nullable();
            $t->string('principal_name')->nullable();
            $t->string('cr_number')->nullable();
            $t->string('license_number')->nullable();
            $t->string('tax_number')->nullable();
            $t->string('currency', 8)->default('SAR');
            $t->decimal('tax_rate', 5, 2)->default(0);
            $t->string('contract_prefix', 12)->default('SCH');
            $t->string('receipt_prefix', 12)->default('RC');
            $t->string('theme', 20)->default('indigo');
            $t->json('settings')->nullable();
            $t->timestamps();
        });

        Schema::create('branches', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name');
            $t->string('city')->nullable();
            $t->string('phone')->nullable();
            $t->string('address')->nullable();
            $t->boolean('is_main')->default(false);
            $t->timestamps();
        });

        Schema::create('app_notifications', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->nullable()->index();
            $t->unsignedBigInteger('user_id')->nullable()->index();
            $t->string('type', 30)->default('info');
            $t->string('title');
            $t->text('body')->nullable();
            $t->string('link')->nullable();
            $t->timestamp('read_at')->nullable();
            $t->timestamps();
        });

        Schema::create('activity_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->nullable()->index();
            $t->unsignedBigInteger('user_id')->nullable();
            $t->string('action', 30);
            $t->string('subject_type', 60)->nullable();
            $t->unsignedBigInteger('subject_id')->nullable();
            $t->string('description')->nullable();
            $t->timestamps();
        });

        Schema::create('announcements', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->nullable()->index(); // null = platform-wide (from super)
            $t->string('title');
            $t->text('body')->nullable();
            $t->string('audience', 20)->default('staff'); // staff | guardians | all
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['announcements', 'activity_logs', 'app_notifications', 'branches', 'companies', 'plans'] as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }
};
