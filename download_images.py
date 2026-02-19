import urllib.request
import os

urls = {
    "desktop_dashboard_primary.png": "https://lh3.googleusercontent.com/aida/AOfcidUsZ6gTQKPq9EWfvlCcJRnz5reN_H2VUohfnH98AMtx0Cgb6_VTbq3BHb3LpaHOl8K1osSRe5Z1HPyPa208ZyFIhlEO2qV3cj-KOzMG89xLkMeskiW_wjP5UDZDqc2jqUXN2xNCNH9LkBe_f8urU-8W7kj8ycWL34SpdCN-tdagPsjoqB73mw325HyXiEfaM1wjpjaZL7N5bpBYxGIKHpLQjPn1xt6dV0u-Upw7bxz7BnQLjB9SXKetyFE",
    "mobile_dashboard.png": "https://lh3.googleusercontent.com/aida/AOfcidXhMHrO3CVhPcw2T_sBTDYdwDsUnL7ZTyG32KU88kpqr6v4fcrG4rqxfoN5hegRNXRiJWUYMuHNTxRJtoTPo8jOgd6WDZC4Mfezkk9rL9_nvMH8wIONQJ1lkjSyppxDi_bKlbhZ6LB_y64bF52gfggEyQi7Fism72zTW0UgwFA1zBRNwjuB367fMRO1HtJcWk8pTMt3WILMt40hd-Ddewkq2UT6c9Ckw-ta0iziLibcoGSqbSH5AYwA7Q",
    "recipe_details.png": "https://lh3.googleusercontent.com/aida/AOfcidX_2EoJGp5cDyg-WCo-L6vYGrHFbC7JxWnIqtkpSr-mZh6lTO1B0d4UGvGRX2quLa48xOBJAGUV_e9j4oRa0iZ5QMpyp-lox3hZJfgnJj3i-WF_KFYic4iL8_K4yN1AQgb7Y0dWHa9bZYnM02app_LTBcbXHXaPuMYnq_abUqfteYalSskG1qsBho-l6LKaelyuTK_1qQBUd-OdGRdIV1l6rpTX2c5faBifU_nqsPTx7h5gxfF-ezyQ2F8",
    "landing_page.png": "https://lh3.googleusercontent.com/aida/AOfcidVeY9h3ptHomz2PTBeOHqioGOgItf1zi6oxiUYed6Bt3IYxrOhfe83TuIRiJUJ7Bwg181x-v_nV10l9XeRxq8l4GQ35Bhl2cWT4dGTMnjiHwSO1hYXABzVT1EhenBWMqty1hJz5yH6foRFXfE_y_UFTo2_3jCTDB_feIEh_DhlZCVFtlwjQ_VsCeuk21MpFHS2AaSGItbHiiS93gfUG-8d3jcG0yA0vEo-wZLDTgbTsL6OFcwbME2vz0A"
}

target_dir = r"C:\Users\alans\.gemini\antigravity\brain\ef4d0cd5-486a-4d22-b8da-0cddd98748f6"

for filename, url in urls.items():
    path = os.path.join(target_dir, filename)
    print(f"Downloading {filename}...")
    try:
        urllib.request.urlretrieve(url, path)
        print(f"Saved to {path}")
    except Exception as e:
        print(f"Failed to download {filename}: {e}")
